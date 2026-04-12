import {
  getCommunityAuthUser,
  getCommunityLevelFromXp,
  insertCommunityNotification,
  normalizeCommunityRole,
  type CommunityAuthEnv,
} from '../../auth';

function isCommunityAdminRole(role: unknown) {
  const normalized = normalizeCommunityRole(role);
  return normalized === 'admin' || normalized === 'owner';
}

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeMediaJson(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return JSON.stringify(Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : []);
  } catch {
    return '[]';
  }
}

function normalizeCommentRow(row: Record<string, unknown>) {
  const xp = Math.max(0, Number(row.xp || 0));

  return {
    id: String(row.id || ''),
    post_id: String(row.post_id || ''),
    content: String(row.content || ''),
    user_id: String(row.user_id || ''),
    username: String(row.username || '[账号不可用]'),
    avatar_url: normalizeNullableText(row.avatar_url),
    background_url: normalizeNullableText(row.background_url),
    signature: normalizeNullableText(row.signature),
    xp,
    level: getCommunityLevelFromXp(xp),
    role: normalizeCommunityRole(row.role),
    created_at: String(row.created_at || '')
  };
}

function normalizePostRow(
  row: Record<string, unknown>,
  viewerLikedIds: Set<string>,
  inlineComments: Record<string, ReturnType<typeof normalizeCommentRow>[]>
) {
  const xp = Math.max(0, Number(row.xp || 0));
  const id = String(row.id || '');

  return {
    id,
    user_id: String(row.user_id || ''),
    content: String(row.content || ''),
    media_json: normalizeMediaJson(row.media_json),
    type: String(row.type || 'post'),
    repost_id: normalizeNullableText(row.repost_id),
    created_at: String(row.created_at || ''),
    username: String(row.username || '[账号不可用]'),
    avatar_url: normalizeNullableText(row.avatar_url),
    background_url: normalizeNullableText(row.background_url),
    signature: normalizeNullableText(row.signature),
    xp,
    level: getCommunityLevelFromXp(xp),
    role: normalizeCommunityRole(row.role),
    like_count: Number(row.like_count || 0),
    comment_count: Number(row.comment_count || 0),
    repost_count: Number(row.repost_count || 0),
    viewer_liked: viewerLikedIds.has(id),
    inline_comments: inlineComments[id] || []
  };
}

export async function listCommunityPosts(env: CommunityAuthEnv, request: Request) {
  const viewer = await getCommunityAuthUser(env, request);
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() || '';
  const userId = url.searchParams.get('userId')?.trim() || '';
  const username = url.searchParams.get('username')?.trim() || '';
  const postId = url.searchParams.get('id')?.trim() || '';

  const where: string[] = [];
  const params: unknown[] = [];

  if (postId) {
    where.push('p.id = ?');
    params.push(postId);
  } else if (query) {
    where.push("(COALESCE(p.content, '') LIKE ? OR COALESCE(u.username, '') LIKE ? OR COALESCE(u.signature, '') LIKE ?)");
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  } else if (userId) {
    where.push('p.user_id = ?');
    params.push(userId);
  } else if (username) {
    where.push('u.username = ?');
    params.push(username);
  }

  const sql = `
    SELECT
      COALESCE(p.id, '') as id,
      COALESCE(p.user_id, '') as user_id,
      COALESCE(p.content, '') as content,
      COALESCE(p.media_json, '[]') as media_json,
      COALESCE(p.type, 'post') as type,
      p.repost_id,
      COALESCE(p.created_at, '') as created_at,
      COALESCE(u.username, '[账号不可用]') as username,
      u.avatar_url,
      u.background_url,
      COALESCE(u.signature, '') as signature,
      COALESCE(u.xp, 0) as xp,
      COALESCE(u.level, 1) as level,
      COALESCE(u.role, 'user') as role,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM posts WHERE repost_id = p.id) as repost_count
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.created_at DESC
    LIMIT ${postId ? 1 : 100}
  `;

  const result = await env.COMMUNITY_DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
  const rows = Array.isArray(result.results) ? result.results : [];

  const viewerLikedIds = new Set<string>();
  const inlineComments: Record<string, ReturnType<typeof normalizeCommentRow>[]> = {};
  const ids = rows.map((row) => String(row.id || '')).filter(Boolean);

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ');

    const commentsResult = await env.COMMUNITY_DB.prepare(
      `SELECT
        COALESCE(c.id, '') as id,
        COALESCE(c.post_id, '') as post_id,
        COALESCE(c.content, '') as content,
        COALESCE(c.user_id, '') as user_id,
        COALESCE(c.created_at, '') as created_at,
        COALESCE(u.username, '[账号不可用]') as username,
        u.avatar_url,
        u.background_url,
        COALESCE(u.signature, '') as signature,
        COALESCE(u.xp, 0) as xp,
        COALESCE(u.role, 'user') as role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id IN (${placeholders})
      ORDER BY c.created_at ASC
      LIMIT 500`
    )
      .bind(...ids)
      .all<Record<string, unknown>>();

    for (const row of commentsResult.results || []) {
      const comment = normalizeCommentRow(row);
      if (!inlineComments[comment.post_id]) {
        inlineComments[comment.post_id] = [];
      }
      inlineComments[comment.post_id].push(comment);
    }

    for (const postId of Object.keys(inlineComments)) {
      inlineComments[postId] = inlineComments[postId].slice(-3);
    }

    if (viewer) {
      const likedResult = await env.COMMUNITY_DB.prepare(
        `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders})`
      )
        .bind(viewer.id, ...ids)
        .all<Record<string, unknown>>();

      for (const row of likedResult.results || []) {
        const likedId = String(row.post_id || '');
        if (likedId) {
          viewerLikedIds.add(likedId);
        }
      }
    }
  }

  const posts = rows.map((row) => normalizePostRow(row, viewerLikedIds, inlineComments));
  return { status: 200, body: { ok: true, posts } };
}

export async function createCommunityPost(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '登录状态失效，请重新登录' } };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, msg: '请求内容无效' } };
  }

  const content = String(body.content || '').trim();
  const repostId = String(body.repost_id || '').trim();
  const media = Array.isArray(body.media) ? body.media.filter((item) => item && typeof item === 'object') : [];

  if (!content && media.length === 0 && !repostId) {
    return { status: 400, body: { ok: false, msg: '帖子内容不能为空' } };
  }

  const id = crypto.randomUUID();
  await env.COMMUNITY_DB.prepare(
    'INSERT INTO posts (id, user_id, content, media_json, type, repost_id) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, user.id, content, JSON.stringify(media), repostId ? 'repost' : 'post', repostId || null)
    .run();

  await env.COMMUNITY_DB.prepare('UPDATE users SET xp = COALESCE(xp, 0) + 5 WHERE id = ?').bind(user.id).run();

  if (repostId) {
    const original = await env.COMMUNITY_DB.prepare('SELECT user_id FROM posts WHERE id = ?')
      .bind(repostId)
      .first<Record<string, unknown>>();

    const targetUserId = String(original?.user_id || '');
    if (targetUserId) {
      await insertCommunityNotification(env, targetUserId, 'repost', user.id, id);
    }
  }

  return { status: 200, body: { ok: true, id, post_id: id } };
}

export async function deleteCommunityPost(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  const url = new URL(request.url);
  const postId = url.searchParams.get('id')?.trim() || '';
  if (!postId) {
    return { status: 400, body: { ok: false, msg: '缺少帖子 id' } };
  }

  const post = await env.COMMUNITY_DB.prepare('SELECT user_id FROM posts WHERE id = ?')
    .bind(postId)
    .first<Record<string, unknown>>();

  if (!post) {
    return { status: 404, body: { ok: false, msg: 'Not found' } };
  }

  if (String(post.user_id || '') !== user.id && !isCommunityAdminRole(user.role)) {
    return { status: 403, body: { ok: false, msg: '没有权限' } };
  }

  await env.COMMUNITY_DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run();
  return { status: 200, body: { ok: true } };
}

export async function toggleCommunityLike(env: CommunityAuthEnv, request: Request) {
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
  if (!postId) {
    return { status: 400, body: { ok: false, msg: '缺少帖子 id' } };
  }

  const post = await env.COMMUNITY_DB.prepare('SELECT user_id FROM posts WHERE id = ?')
    .bind(postId)
    .first<Record<string, unknown>>();

  if (!post) {
    return { status: 404, body: { ok: false, msg: '帖子不存在' } };
  }

  try {
    await env.COMMUNITY_DB.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').bind(postId, user.id).run();
    await env.COMMUNITY_DB.prepare('UPDATE users SET xp = COALESCE(xp, 0) + 1 WHERE id = ?').bind(user.id).run();
    const targetUserId = String(post.user_id || '');
    if (targetUserId) {
      await insertCommunityNotification(env, targetUserId, 'like', user.id, postId);
    }
    return { status: 200, body: { ok: true, action: 'liked' } };
  } catch {
    await env.COMMUNITY_DB.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').bind(postId, user.id).run();
    return { status: 200, body: { ok: true, action: 'unliked' } };
  }
}
