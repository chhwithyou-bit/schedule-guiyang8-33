import { sha256Hex } from '../../middleware/auth/hash';

const COMMUNITY_LEVEL_THRESHOLDS = [0, 10, 25, 45, 70, 100, 140, 190, 250, 325, 415, 520, 640, 780, 940, 1120, 1325, 1555, 1810, 2090];

export interface D1QueryResult<T = Record<string, unknown>> {
  results?: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
}

export interface CommunityAuthEnv {
  COMMUNITY_DB: D1DatabaseLike;
}

let communitySchemaPromise: Promise<void> | null = null;

const COMMUNITY_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    avatar_url TEXT,
    signature TEXT,
    background_url TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    is_banned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    media_json TEXT,
    type TEXT DEFAULT 'post',
    repost_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(post_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(follower_id, following_id)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    from_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_id TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    kind TEXT DEFAULT 'direct',
    title TEXT,
    description TEXT,
    avatar_url TEXT,
    direct_key TEXT UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    last_read_at DATETIME,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(conversation_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    meta_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
] as const;

export async function ensureCommunityCoreSchema(env: CommunityAuthEnv) {
  if (!communitySchemaPromise) {
    communitySchemaPromise = (async () => {
      for (const statement of COMMUNITY_SCHEMA_STATEMENTS) {
        await env.COMMUNITY_DB.prepare(statement).run();
      }
    })().catch((error) => {
      communitySchemaPromise = null;
      throw error;
    });
  }

  return communitySchemaPromise;
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
  is_banned?: number | boolean;
};

function normalizeNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeCommunityUser(record: Record<string, unknown>, passHash: string): CommunityAuthUser {
  const xp = Math.max(0, Number(record.xp || 0));

  return {
    id: String(record.id || ''),
    username: String(record.username || ''),
    passHash,
    role: normalizeCommunityRole(record.role),
    level: getCommunityLevelFromXp(xp),
    xp,
    signature: normalizeNullableText(record.signature),
    avatar_url: normalizeNullableText(record.avatar_url),
    background_url: normalizeNullableText(record.background_url),
    is_banned: record.is_banned === true || record.is_banned === 1 ? 1 : 0
  };
}

function parseCommunityBearerToken(headerValue: string | null) {
  const authorization = String(headerValue || '').trim();
  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice(7).trim();
  const separatorIndex = token.indexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }

  try {
    const username = decodeURIComponent(token.slice(0, separatorIndex));
    const passHash = token.slice(separatorIndex + 1).trim();
    if (!username || !passHash) {
      return null;
    }
    return { username, passHash };
  } catch {
    return null;
  }
}

export function getCommunityLevelFromXp(xp: unknown) {
  const safeXp = Math.max(0, Number(xp || 0));

  for (let index = COMMUNITY_LEVEL_THRESHOLDS.length - 1; index >= 0; index -= 1) {
    if (safeXp >= COMMUNITY_LEVEL_THRESHOLDS[index]) {
      return index + 1;
    }
  }

  return 1;
}

export function normalizeCommunityRole(role: unknown) {
  const normalized = String(role || 'user').trim().toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (normalized === 'admin') return 'admin';
  return 'user';
}

export async function getCommunityAuthUser(env: CommunityAuthEnv, request: Request) {
  await ensureCommunityCoreSchema(env);

  const token = parseCommunityBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return null;
  }

  const record = await env.COMMUNITY_DB.prepare(
    'SELECT id, username, role, xp, level, signature, avatar_url, background_url, is_banned FROM users WHERE username = ? AND password_hash = ?'
  )
    .bind(token.username, token.passHash)
    .first<Record<string, unknown>>();

  if (!record) {
    return null;
  }

  const user = normalizeCommunityUser(record, token.passHash);
  if (user.is_banned) {
    return null;
  }

  return user;
}

export async function insertCommunityNotification(
  env: CommunityAuthEnv,
  userId: string,
  type: string,
  fromUserId: string,
  targetId: string | null = null
) {
  await ensureCommunityCoreSchema(env);

  if (!userId || !fromUserId || userId === fromUserId) {
    return;
  }

  await env.COMMUNITY_DB.prepare(
    'INSERT INTO notifications (id, user_id, type, from_user_id, target_id) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), userId, type, fromUserId, targetId)
    .run();
}

export async function handleCommunityAuth(env: CommunityAuthEnv, body: CommunityAuthRequest) {
  await ensureCommunityCoreSchema(env);

  const action = body.action;
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!action || !username || !password) {
    return { status: 400, body: { ok: false, msg: '缺少用户名、密码或操作类型' } };
  }

  const passHash = await sha256Hex(password);

  if (action === 'register') {
    const id = crypto.randomUUID();
    const role = username === 'admin' ? 'owner' : 'user';

    try {
      await env.COMMUNITY_DB.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
        .bind(id, username, passHash, role)
        .run();

      const user: CommunityAuthUser = {
        id,
        username,
        passHash,
        role,
        level: 1,
        xp: 0,
        signature: null,
        avatar_url: null,
        background_url: null,
        is_banned: 0
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

    const user = normalizeCommunityUser(record, passHash);
    if (user.is_banned) {
      return { status: 403, body: { ok: false, msg: '账号已被封禁' } };
    }

    return { status: 200, body: { ok: true, user } };
  }

  return { status: 400, body: { ok: false, msg: '不支持的认证操作' } };
}
