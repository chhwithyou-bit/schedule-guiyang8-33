import { getCommunityAuthUser, type CommunityAuthEnv } from '../../auth';

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeGroupRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ''),
    title: String(row.title || '未命名群组'),
    description: normalizeNullableText(row.description),
    avatar_url: normalizeNullableText(row.avatar_url),
    updated_at: String(row.updated_at || ''),
    member_count: Number(row.member_count || 0),
    joined: Boolean(row.joined)
  };
}

export async function listCommunityGroups(env: CommunityAuthEnv, request: Request) {
  const viewer = await getCommunityAuthUser(env, request);
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() || '';
  const likeQuery = `%${query}%`;

  const sql = query
    ? `
      SELECT
        c.id,
        c.title,
        c.description,
        c.avatar_url,
        c.updated_at,
        (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count,
        ? IS NOT NULL AND EXISTS(
          SELECT 1 FROM conversation_members cm
          WHERE cm.conversation_id = c.id AND cm.user_id = ?
        ) AS joined
      FROM conversations c
      WHERE c.kind = 'group' AND (COALESCE(c.title, '') LIKE ? OR COALESCE(c.description, '') LIKE ?)
      ORDER BY datetime(c.updated_at) DESC, c.title COLLATE NOCASE ASC
      LIMIT 50
    `
    : `
      SELECT
        c.id,
        c.title,
        c.description,
        c.avatar_url,
        c.updated_at,
        (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count,
        ? IS NOT NULL AND EXISTS(
          SELECT 1 FROM conversation_members cm
          WHERE cm.conversation_id = c.id AND cm.user_id = ?
        ) AS joined
      FROM conversations c
      WHERE c.kind = 'group'
      ORDER BY datetime(c.updated_at) DESC, c.title COLLATE NOCASE ASC
      LIMIT 50
    `;

  const result = await env.COMMUNITY_DB.prepare(sql)
    .bind(viewer?.id || null, viewer?.id || null, ...(query ? [likeQuery, likeQuery] : []))
    .all<Record<string, unknown>>();

  const groups = (result.results || []).map(normalizeGroupRow);
  return { status: 200, body: { ok: true, groups, query } };
}

export async function createCommunityGroup(env: CommunityAuthEnv, request: Request) {
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

  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const memberIds = Array.from(
    new Set(
      (Array.isArray(body.member_ids) ? body.member_ids : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  if (!title) {
    return { status: 400, body: { ok: false, msg: '群组名称不能为空' } };
  }
  if (title.length > 42) {
    return { status: 400, body: { ok: false, msg: '群组名称太长了' } };
  }

  const validMembers = memberIds.filter((id) => id !== user.id).slice(0, 12);
  const conversationId = crypto.randomUUID();

  await env.COMMUNITY_DB.prepare(
    `
      INSERT INTO conversations (id, kind, title, description, avatar_url, direct_key, created_by, updated_at)
      VALUES (?, 'group', ?, ?, '', NULL, ?, CURRENT_TIMESTAMP)
    `
  )
    .bind(conversationId, title, description, user.id)
    .run();

  const memberValues = [`(?, ?, 'owner', CURRENT_TIMESTAMP)`];
  const memberParams: unknown[] = [conversationId, user.id];

  for (const memberId of validMembers) {
    memberValues.push(`(?, ?, 'member', CURRENT_TIMESTAMP)`);
    memberParams.push(conversationId, memberId);
  }

  await env.COMMUNITY_DB.prepare(
    `
      INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
      VALUES ${memberValues.join(', ')}
    `
  )
    .bind(...memberParams)
    .run();

  return { status: 200, body: { ok: true, conversation_id: conversationId } };
}

export async function joinCommunityGroup(env: CommunityAuthEnv, request: Request) {
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

  const conversationId = String(body.conversation_id || '').trim();
  if (!conversationId) {
    return { status: 400, body: { ok: false, msg: '缺少群组 id' } };
  }

  const group = await env.COMMUNITY_DB.prepare(
    `
      SELECT id, kind
      FROM conversations
      WHERE id = ?
      LIMIT 1
    `
  )
    .bind(conversationId)
    .first<Record<string, unknown>>();

  if (!group || String(group.kind || '') !== 'group') {
    return { status: 404, body: { ok: false, msg: '群组不存在' } };
  }

  await env.COMMUNITY_DB.prepare(
    `
      INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
      VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
    `
  )
    .bind(conversationId, user.id)
    .run();

  await env.COMMUNITY_DB.prepare(
    `
      UPDATE conversations
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  )
    .bind(conversationId)
    .run();

  return { status: 200, body: { ok: true } };
}
