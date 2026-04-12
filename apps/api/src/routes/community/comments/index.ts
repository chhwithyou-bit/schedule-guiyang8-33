import { getCommunityAuthUser, getCommunityLevelFromXp, insertCommunityNotification, normalizeCommunityRole, type CommunityAuthEnv } from '../../auth';

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function listCommunityComments(env: CommunityAuthEnv, request: Request) {
  const url = new URL(request.url);
  const postId = url.searchParams.get('postId')?.trim() || '';

  if (!postId) {
    return { status: 400, body: { ok: false, msg: '缺少帖子 id' } };
  }

  const result = await env.COMMUNITY_DB.prepare(`
    SELECT
      COALESCE(c.id, '') as id,
      COALESCE(c.post_id, '') as post_id,
      COALESCE(c.user_id, '') as user_id,
      c.parent_id,
      COALESCE(c.content, '') as content,
      COALESCE(c.created_at, '') as created_at,
      COALESCE(u.username, '[账号不可用]') as username,
      u.avatar_url,
      u.background_url,
      COALESCE(u.signature, '') as signature,
      COALESCE(u.xp, 0) as xp,
      COALESCE(u.level, 1) as level,
      COALESCE(u.role, 'user') as role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `)
    .bind(postId)
    .all<Record<string, unknown>>();

  const comments = (result.results || []).map((row) => {
    const xp = Math.max(0, Number(row.xp || 0));
    return {
      id: String(row.id || ''),
      post_id: String(row.post_id || ''),
      user_id: String(row.user_id || ''),
      parent_id: normalizeNullableText(row.parent_id),
      content: String(row.content || ''),
      created_at: String(row.created_at || ''),
      username: String(row.username || '[账号不可用]'),
      avatar_url: normalizeNullableText(row.avatar_url),
      background_url: normalizeNullableText(row.background_url),
      signature: normalizeNullableText(row.signature),
      xp,
      level: getCommunityLevelFromXp(xp),
      role: normalizeCommunityRole(row.role)
    };
  });

  return { status: 200, body: { ok: true, comments } };
}

export async function createCommunityComment(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, msg: '请求内容无效' } };
  }

  const postId = String(body.post_id || '').trim();
  const content = String(body.content || '').trim();
  const parentId = String(body.parent_id || '').trim();

  if (!postId || !content) {
    return { status: 400, body: { ok: false, msg: '评论内容不能为空' } };
  }

  const post = await env.COMMUNITY_DB.prepare('SELECT user_id FROM posts WHERE id = ?')
    .bind(postId)
    .first<Record<string, unknown>>();

  if (!post) {
    return { status: 404, body: { ok: false, msg: '帖子不存在' } };
  }

  const id = crypto.randomUUID();
  await env.COMMUNITY_DB.prepare(
    'INSERT INTO comments (id, post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, postId, user.id, parentId || null, content)
    .run();

  await env.COMMUNITY_DB.prepare('UPDATE users SET xp = COALESCE(xp, 0) + 2 WHERE id = ?').bind(user.id).run();

  const targetUserId = String(post.user_id || '');
  if (targetUserId) {
    await insertCommunityNotification(env, targetUserId, 'comment', user.id, postId);
  }

  return { status: 200, body: { ok: true, id, comment_id: id } };
}

export async function createCommunityReport(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, msg: '请求内容无效' } };
  }

  const targetType = String(body.target_type || '').trim();
  const targetId = String(body.target_id || '').trim();
  const reason = String(body.reason || '').trim();

  if (!targetType || !targetId || !reason) {
    return { status: 400, body: { ok: false, msg: '举报信息不完整' } };
  }

  await env.COMMUNITY_DB.prepare(
    'INSERT INTO reports (id, user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), user.id, targetType, targetId, reason)
    .run();

  return { status: 200, body: { ok: true } };
}
