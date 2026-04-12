import { getCommunityAuthUser, normalizeCommunityRole, type CommunityAuthEnv } from '../../auth';

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeDiscoveryUser(row: Record<string, unknown>) {
  const xp = Math.max(0, Number(row.xp || 0));

  return {
    id: String(row.id || ''),
    username: String(row.username || ''),
    avatar_url: normalizeNullableText(row.avatar_url),
    signature: normalizeNullableText(row.signature),
    xp,
    level: Math.max(1, Number(row.level || 1)),
    role: normalizeCommunityRole(row.role)
  };
}

function normalizeDiscoveryGroup(row: Record<string, unknown>) {
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

export async function buildCommunityDiscovery(env: CommunityAuthEnv, request: Request) {
  const viewer = await getCommunityAuthUser(env, request);
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() || '';
  const likeQuery = `%${query}%`;

  const userSql = query
    ? `
      SELECT id, username, avatar_url, background_url, signature, COALESCE(xp, 0) AS xp, COALESCE(level, 1) AS level, COALESCE(role, 'user') AS role
      FROM users
      WHERE is_banned = 0 AND (username LIKE ? OR COALESCE(signature, '') LIKE ?)
      ORDER BY xp DESC, created_at DESC
      LIMIT 8
    `
    : `
      SELECT id, username, avatar_url, background_url, signature, COALESCE(xp, 0) AS xp, COALESCE(level, 1) AS level, COALESCE(role, 'user') AS role
      FROM users
      WHERE is_banned = 0
      ORDER BY xp DESC, created_at DESC
      LIMIT 8
    `;

  const groupSql = query
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
      LIMIT 8
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
      LIMIT 8
    `;

  const userRows = await env.COMMUNITY_DB.prepare(userSql)
    .bind(...(query ? [likeQuery, likeQuery] : []))
    .all<Record<string, unknown>>();

  const groupRows = await env.COMMUNITY_DB.prepare(groupSql)
    .bind(viewer?.id || null, viewer?.id || null, ...(query ? [likeQuery, likeQuery] : []))
    .all<Record<string, unknown>>();

  const users = (userRows.results || [])
    .filter((row) => String(row.id || '') !== viewer?.id)
    .map(normalizeDiscoveryUser);

  const groups = (groupRows.results || []).map(normalizeDiscoveryGroup);

  return { status: 200, body: { ok: true, users, groups, query } };
}
