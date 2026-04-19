import { sha256Hex } from '../../middleware/auth/hash';

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

    const user: CommunityAuthUser = {
      id: String(record.id || ''),
      username,
      passHash,
      role: String(record.role || 'user'),
      level: Number(record.level || 1),
      xp: Number(record.xp || 0),
      signature: typeof record.signature === 'string' ? record.signature : null,
      avatar_url: typeof record.avatar_url === 'string' ? record.avatar_url : null,
      background_url: typeof record.background_url === 'string' ? record.background_url : null
    };

    return { status: 200, body: { ok: true, user } };
  }

  return { status: 400, body: { ok: false, msg: '不支持的认证操作' } };
}
