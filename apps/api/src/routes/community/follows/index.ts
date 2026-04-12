import { getCommunityAuthUser, getCommunityLevelFromXp, insertCommunityNotification, normalizeCommunityRole, type CommunityAuthEnv } from '../../auth';

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function toggleCommunityFollow(env: CommunityAuthEnv, request: Request) {
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

  const followingId = String(body.following_id || '').trim();
  if (!followingId) {
    return { status: 400, body: { ok: false, msg: '缺少关注目标' } };
  }

  if (followingId === user.id) {
    return { status: 400, body: { ok: false, msg: '不能关注自己' } };
  }

  try {
    await env.COMMUNITY_DB.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').bind(user.id, followingId).run();
    await insertCommunityNotification(env, followingId, 'follow', user.id, null);
    return { status: 200, body: { ok: true, action: 'followed' } };
  } catch {
    await env.COMMUNITY_DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').bind(user.id, followingId).run();
    return { status: 200, body: { ok: true, action: 'unfollowed' } };
  }
}

export async function getCommunityProfile(env: CommunityAuthEnv, request: Request) {
  const viewer = await getCommunityAuthUser(env, request);
  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() || '';
  const username = url.searchParams.get('username')?.trim() || '';

  if (!id && !username) {
    return { status: 400, body: { ok: false, msg: '缺少用户标识' } };
  }

  const where = id ? 'id = ?' : 'username = ?';
  const target = id || username;

  const user = await env.COMMUNITY_DB.prepare(
    `SELECT id, username, avatar_url, background_url, signature, level, xp, role, is_banned, created_at FROM users WHERE ${where} LIMIT 1`
  )
    .bind(target)
    .first<Record<string, unknown>>();

  if (!user) {
    return { status: 404, body: { ok: false, msg: '用户不存在' } };
  }

  const followers = await env.COMMUNITY_DB.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?')
    .bind(String(user.id || ''))
    .first<Record<string, unknown>>();
  const following = await env.COMMUNITY_DB.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?')
    .bind(String(user.id || ''))
    .first<Record<string, unknown>>();

  let viewerIsFollowing = false;
  if (viewer && viewer.id !== String(user.id || '')) {
    const relation = await env.COMMUNITY_DB.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
      .bind(viewer.id, String(user.id || ''))
      .first<Record<string, unknown>>();
    viewerIsFollowing = Boolean(relation);
  }

  const xp = Math.max(0, Number(user.xp || 0));
  return {
    status: 200,
    body: {
      ok: true,
      user: {
        id: String(user.id || ''),
        username: String(user.username || ''),
        avatar_url: normalizeNullableText(user.avatar_url),
        background_url: normalizeNullableText(user.background_url),
        signature: normalizeNullableText(user.signature),
        level: getCommunityLevelFromXp(xp),
        xp,
        role: normalizeCommunityRole(user.role),
        is_banned: user.is_banned,
        created_at: String(user.created_at || ''),
        followers_count: Number(followers?.count || 0),
        following_count: Number(following?.count || 0),
        viewer_is_following: viewerIsFollowing
      }
    }
  };
}

export async function updateCommunityProfile(env: CommunityAuthEnv, request: Request) {
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

  const signature = typeof body.signature === 'string' ? body.signature : null;
  const avatarUrl = typeof body.avatar_url === 'string' ? body.avatar_url : null;
  const backgroundUrl = typeof body.background_url === 'string' ? body.background_url : null;

  await env.COMMUNITY_DB.prepare(
    'UPDATE users SET signature = COALESCE(?, signature), avatar_url = COALESCE(?, avatar_url), background_url = COALESCE(?, background_url) WHERE id = ?'
  )
    .bind(signature, avatarUrl, backgroundUrl, user.id)
    .run();

  return { status: 200, body: { ok: true } };
}
