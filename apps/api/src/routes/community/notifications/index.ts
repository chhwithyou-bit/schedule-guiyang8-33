import { getCommunityAuthUser, normalizeCommunityRole, type CommunityAuthEnv } from '../../auth';

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function listCommunityNotifications(env: CommunityAuthEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  const result = await env.COMMUNITY_DB.prepare(`
    SELECT
      COALESCE(n.id, '') as id,
      COALESCE(n.user_id, '') as user_id,
      COALESCE(n.type, '') as type,
      COALESCE(n.from_user_id, '') as from_user_id,
      n.target_id,
      COALESCE(n.is_read, 0) as is_read,
      COALESCE(n.created_at, '') as created_at,
      COALESCE(u.username, '[账号不可用]') as username,
      u.avatar_url,
      COALESCE(u.role, 'user') as role
    FROM notifications n
    LEFT JOIN users u ON n.from_user_id = u.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `)
    .bind(user.id)
    .all<Record<string, unknown>>();

  const notifications = (result.results || []).map((row) => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    type: String(row.type || ''),
    from_user_id: String(row.from_user_id || ''),
    target_id: normalizeNullableText(row.target_id),
    is_read: Boolean(row.is_read),
    created_at: String(row.created_at || ''),
    username: String(row.username || '[账号不可用]'),
    avatar_url: normalizeNullableText(row.avatar_url),
    role: normalizeCommunityRole(row.role)
  }));

  return {
    status: 200,
    body: {
      ok: true,
      notifications,
      unread: notifications.filter((item) => !item.is_read).length
    }
  };
}
