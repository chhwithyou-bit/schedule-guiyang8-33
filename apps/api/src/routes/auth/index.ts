import { sha256Hex } from '../../middleware/auth/hash.ts';

const COMMUNITY_LEVEL_THRESHOLDS = [0, 10, 25, 45, 70, 100, 140, 190, 250, 325, 415, 520, 640, 780, 940, 1120, 1325, 1555, 1810, 2090];
const DEFAULT_COMMUNITY_OWNER_USERS = 'admin';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
}

export interface CommunityAuthEnv {
  COMMUNITY_DB: D1DatabaseLike;
  COMMUNITY_OWNER_USERS?: string;
  COMMUNITY_OWNER_IDS?: string;
}

export type CommunityAuthAction = 'register' | 'login';

export type CommunityAuthRequest = {
  action?: CommunityAuthAction;
  username?: string;
  password?: string;
};

export type CommunityAuthUser = {
  id: string;
  username: string;
  passHash: string;
  role: string;
  level: number;
  xp: number;
  signature?: string | null;
  avatar_url?: string | null;
  background_url?: string | null;
};

function parseIdentityList(value: string | undefined) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getCommunityLevelFromXp(xpValue: unknown) {
  const xp = Math.max(0, Number(xpValue || 0));
  for (let i = COMMUNITY_LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (xp >= COMMUNITY_LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function normalizeCommunityRole(user: Record<string, unknown> | null | undefined, env: Pick<CommunityAuthEnv, 'COMMUNITY_OWNER_USERS' | 'COMMUNITY_OWNER_IDS'>) {
  const baseRole = String(user?.role || 'user').trim().toLowerCase();
  if (baseRole !== 'admin') return 'user';

  const ownerUsers = parseIdentityList(env.COMMUNITY_OWNER_USERS || DEFAULT_COMMUNITY_OWNER_USERS);
  const ownerIds = parseIdentityList(env.COMMUNITY_OWNER_IDS);
  const username = String(user?.username || '').trim().toLowerCase();
  const id = String(user?.id || '').trim().toLowerCase();

  return ownerUsers.has(username) || ownerIds.has(id) ? 'owner' : 'admin';
}

export function withCommunityRole<T extends Record<string, unknown> | null>(user: T, env: Pick<CommunityAuthEnv, 'COMMUNITY_OWNER_USERS' | 'COMMUNITY_OWNER_IDS'>): T {
  if (!user) return user;
  const role = normalizeCommunityRole(user, env);
  return (role === user.role ? user : { ...user, role }) as T;
}

export function withCommunityLevel<T extends Record<string, unknown> | null>(entity: T): T {
  if (!entity) return entity;
  const xp = Math.max(0, Number(entity.xp || 0));
  const level = getCommunityLevelFromXp(xp);
  return (entity.xp === xp && entity.level === level ? entity : { ...entity, xp, level }) as T;
}

export async function resolveCommunityUserFromAuthHeader(env: CommunityAuthEnv, authorization: string | null | undefined) {
  const auth = String(authorization || '');
  if (!auth.startsWith('Bearer ')) return null;

  const raw = auth.slice(7);
  const sep = raw.indexOf(':');
  if (sep === -1) return null;

  const rawUser = raw.slice(0, sep);
  const passHash = raw.slice(sep + 1);
  let username = rawUser;

  try {
    username = decodeURIComponent(rawUser);
  } catch {
    username = rawUser;
  }

  const user = await env.COMMUNITY_DB.prepare(
    'SELECT id, username, role, xp, level, signature, avatar_url, background_url, is_banned, password_hash FROM users WHERE username = ? AND password_hash = ?'
  )
    .bind(username, passHash)
    .first<Record<string, unknown>>();

  if (!user || user.is_banned) return null;

  return buildCommunityAuthUser(user, username, passHash, env);
}

function buildCommunityAuthUser(record: Record<string, unknown>, username: string, passHash: string, env: Pick<CommunityAuthEnv, 'COMMUNITY_OWNER_USERS' | 'COMMUNITY_OWNER_IDS'>): CommunityAuthUser {
  const normalizedRecord = withCommunityLevel(withCommunityRole(record, env));
  return {
    id: String(normalizedRecord?.id || ''),
    username,
    passHash,
    role: String(normalizedRecord?.role || 'user'),
    level: Number(normalizedRecord?.level || 1),
    xp: Number(normalizedRecord?.xp || 0),
    signature: typeof normalizedRecord?.signature === 'string' ? normalizedRecord.signature : null,
    avatar_url: typeof normalizedRecord?.avatar_url === 'string' ? normalizedRecord.avatar_url : null,
    background_url: typeof normalizedRecord?.background_url === 'string' ? normalizedRecord.background_url : null
  };
}

export async function handleCommunityAuth(env: CommunityAuthEnv, body: CommunityAuthRequest) {
  const action = body.action;
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!action || !username || !password) {
    return { status: 400, body: { ok: false, msg: '缺少用户名、密码或操作类型' } };
  }

  const passHash = await sha256Hex(password);

  if (action === 'register') {
    const id = crypto.randomUUID();
    try {
      await env.COMMUNITY_DB.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
        .bind(id, username, passHash)
        .run();

      const user: CommunityAuthUser = {
        id,
        username,
        passHash,
        role: 'user',
        level: 1,
        xp: 0
      };

      return { status: 200, body: { ok: true, user } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('UNIQUE')) {
        return { status: 409, body: { ok: false, msg: '该用户名已被注册' } };
      }
      return { status: 500, body: { ok: false, msg: `注册异常: ${msg}` } };
    }
  }

  if (action === 'login') {
    const record = await env.COMMUNITY_DB.prepare(
      'SELECT id, username, role, xp, level, signature, avatar_url, background_url, is_banned FROM users WHERE username = ? AND password_hash = ?'
    )
      .bind(username, passHash)
      .first<Record<string, unknown>>();

    if (!record) {
      return { status: 401, body: { ok: false, msg: '用户名或密码错误' } };
    }

    if (record.is_banned) {
      return { status: 403, body: { ok: false, msg: '账号已被封禁' } };
    }

    const user = buildCommunityAuthUser(record, username, passHash, env);
    return { status: 200, body: { ok: true, user } };
  }

  return { status: 400, body: { ok: false, msg: '不支持的认证操作' } };
}
