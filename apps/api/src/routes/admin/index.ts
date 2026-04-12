import { sha256Hex } from '../../middleware/auth/hash';
import {
  getCommunityAuthUser,
  normalizeCommunityRole,
  type CommunityAuthEnv
} from '../auth';
import { ensureDriveSchema } from '../community/drive';
import { parseNodes, type NodeSourceRecord, type ProxyNodeRecord } from '../nodes';

export type AdminAction =
  | 'delete_item'
  | 'resolve_report'
  | 'ban_user'
  | 'unban_user'
  | 'grant_admin'
  | 'revoke_admin'
  | 'reset_password'
  | 'set_drive_quota'
  | 'set_announcement'
  | 'set_nodes_password'
  | 'create_node_source'
  | 'delete_node_source';

export type AdminDashboardPayload = {
  ok: boolean;
  reports: unknown[];
  users: unknown[];
  announcement: { content: string; updatedAt?: string | null };
  node_sources?: unknown[];
  proxy_nodes?: unknown[];
  nodes_password_configured?: boolean;
};

type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type AdminEnv = CommunityAuthEnv & {
  SCHEDULE_KV?: KvLike;
};

type AdminActionRequest = {
  action?: string;
  target_type?: string;
  target_id?: string;
  report_id?: string;
  new_password?: string;
  content?: string;
  quota_gb?: string | number;
  source_id?: string;
  source_label?: string;
  source_type?: string;
  source_url?: string;
  source_content?: string;
  enabled?: boolean;
};

type CommunityUserRow = {
  id?: string;
  username?: string;
  role?: string;
  is_banned?: number | boolean;
  drive_quota?: number;
  drive_used?: number;
  avatar_url?: string | null;
  created_at?: string;
  xp?: number;
  level?: number;
};

export function normalizeAdminDashboardPayload(payload: Partial<AdminDashboardPayload>): AdminDashboardPayload {
  return {
    ok: true,
    reports: Array.isArray(payload.reports) ? payload.reports : [],
    users: Array.isArray(payload.users) ? payload.users : [],
    announcement: {
      content: String(payload.announcement?.content || ''),
      updatedAt: payload.announcement?.updatedAt || null
    },
    node_sources: Array.isArray(payload.node_sources) ? payload.node_sources : [],
    proxy_nodes: Array.isArray(payload.proxy_nodes) ? payload.proxy_nodes : [],
    nodes_password_configured: Boolean(payload.nodes_password_configured)
  };
}

export function createAdminActionBody(action: AdminAction, target_type: string, target_id: string, extra: Record<string, unknown> = {}) {
  return {
    action,
    target_type,
    target_id,
    ...extra
  };
}

function requireScheduleKv(env: AdminEnv) {
  if (!env.SCHEDULE_KV) {
    throw new Error('SCHEDULE_KV binding is required');
  }
  return env.SCHEDULE_KV;
}

function isCommunityAdminRole(role: unknown) {
  const normalized = normalizeCommunityRole(role);
  return normalized === 'admin' || normalized === 'owner';
}

function isCommunityOwnerRole(role: unknown) {
  return normalizeCommunityRole(role) === 'owner';
}

async function readAnnouncement(env: AdminEnv) {
  const raw = await env.SCHEDULE_KV?.get?.('community_announcement');
  if (!raw) {
    return { content: '', updatedAt: null };
  }

  try {
    const parsed = JSON.parse(raw) as { content?: unknown; updatedAt?: unknown };
    return {
      content: String(parsed.content || ''),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    };
  } catch {
    return { content: '', updatedAt: null };
  }
}

function normalizeNodeSourceRecord(record: Partial<NodeSourceRecord>): NodeSourceRecord {
  return {
    id: String(record.id || ''),
    source_type: String(record.source_type || 'manual'),
    label: String(record.label || '未命名来源'),
    source_url: record.source_url ? String(record.source_url) : null,
    source_content: record.source_content ? String(record.source_content) : null,
    enabled: record.enabled !== false,
    node_count: Math.max(0, Number(record.node_count || 0)),
    last_error: record.last_error ? String(record.last_error) : null,
    updated_at: String(record.updated_at || new Date().toISOString())
  };
}

function normalizeProxyNodeRecord(record: Partial<ProxyNodeRecord>): ProxyNodeRecord {
  return {
    id: String(record.id || ''),
    name: String(record.name || '未命名节点'),
    raw: String(record.raw || ''),
    protocol: String(record.protocol || 'unknown'),
    source_id: record.source_id ? String(record.source_id) : null,
    source_label: record.source_label ? String(record.source_label) : null
  };
}

async function readJsonList<T>(store: KvLike | undefined, key: string, fallback: T[] = []) {
  const raw = await store?.get(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

async function readNodeSources(env: AdminEnv) {
  const sources = await readJsonList<Partial<NodeSourceRecord>>(env.SCHEDULE_KV, 'proxy_node_sources');
  return sources.map(normalizeNodeSourceRecord);
}

async function writeNodeSources(env: AdminEnv, sources: NodeSourceRecord[]) {
  await requireScheduleKv(env).put('proxy_node_sources', JSON.stringify(sources));
}

async function readProxyNodes(env: AdminEnv) {
  const nextNodes = await readJsonList<Partial<ProxyNodeRecord>>(env.SCHEDULE_KV, 'proxy_nodes');
  if (nextNodes.length > 0) {
    return nextNodes.map(normalizeProxyNodeRecord);
  }

  const legacyNodes = await readJsonList<Partial<ProxyNodeRecord>>(env.SCHEDULE_KV, 'nodes_list');
  return legacyNodes.map(normalizeProxyNodeRecord);
}

async function writeProxyNodes(env: AdminEnv, nodes: ProxyNodeRecord[]) {
  const payload = JSON.stringify(nodes);
  const store = requireScheduleKv(env);
  await store.put('proxy_nodes', payload);
  await store.put('nodes_list', payload);
}

async function readNodePasswordHash(env: AdminEnv) {
  const store = env.SCHEDULE_KV;
  const nextHash = String((await store?.get('proxy_nodes_password_hash')) || '').trim();
  if (nextHash) return nextHash;

  const legacyPassword = String((await store?.get('nodes_user_pwd')) || '').trim();
  if (!legacyPassword || !store) return '';

  const migratedHash = await sha256Hex(legacyPassword);
  await store.put('proxy_nodes_password_hash', migratedHash);
  return migratedHash;
}

function mergeNodesFromSources(sources: NodeSourceRecord[]) {
  return sources
    .filter((source) => source.enabled !== false)
    .flatMap((source) => {
      const parsedNodes = parseNodes(String(source.source_content || ''));
      return parsedNodes.map((node) => ({
        ...node,
        source_id: source.id,
        source_label: source.label
      } satisfies ProxyNodeRecord));
    });
}

async function getTargetCommunityUser(env: AdminEnv, targetId: string) {
  if (!targetId.trim()) return null;

  const row = await env.COMMUNITY_DB.prepare(
    `SELECT
      u.id,
      u.username,
      u.role,
      u.is_banned,
      u.avatar_url,
      u.created_at,
      COALESCE(u.xp, 0) as xp,
      COALESCE(u.level, 1) as level,
      COALESCE(ds.quota_bytes, 0) as drive_quota,
      COALESCE(ds.used_bytes, 0) as drive_used
    FROM users u
    LEFT JOIN user_drive_stats ds ON u.id = ds.user_id
    WHERE u.id = ?`
  )
    .bind(targetId)
    .first<CommunityUserRow>();

  if (!row) return null;

  return {
    ...row,
    role: normalizeCommunityRole(row.role),
    drive_quota: Number(row.drive_quota || 0),
    drive_used: Number(row.drive_used || 0),
    is_banned: row.is_banned === true || row.is_banned === 1 ? 1 : 0
  };
}

export async function getCommunityAdminData(env: AdminEnv, request: Request) {
  const actor = await getCommunityAuthUser(env, request);
  if (!actor || !isCommunityAdminRole(actor.role)) {
    return { status: 403, body: { ok: false } };
  }

  await ensureDriveSchema(env);

  const [reportsResult, usersResult, announcement, nodeSources, proxyNodes, nodesPasswordHash] = await Promise.all([
    env.COMMUNITY_DB.prepare("SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at DESC").all<Record<string, unknown>>(),
    env.COMMUNITY_DB.prepare(
      `SELECT
        u.id,
        u.username,
        u.role,
        u.level,
        u.xp,
        u.is_banned,
        u.created_at,
        u.avatar_url,
        COALESCE(ds.quota_bytes, 0) as drive_quota,
        COALESCE(ds.used_bytes, 0) as drive_used
      FROM users u
      LEFT JOIN user_drive_stats ds ON u.id = ds.user_id
      ORDER BY u.created_at DESC`
    ).all<CommunityUserRow>(),
    readAnnouncement(env),
    readNodeSources(env),
    readProxyNodes(env),
    readNodePasswordHash(env)
  ]);

  const users = (usersResult.results || []).map((row) => ({
    ...row,
    role: normalizeCommunityRole(row.role),
    drive_quota: Number(row.drive_quota || 0),
    drive_used: Number(row.drive_used || 0),
    is_banned: row.is_banned === true || row.is_banned === 1 ? 1 : 0
  }));

  return {
    status: 200,
    body: normalizeAdminDashboardPayload({
      reports: reportsResult.results || [],
      users,
      announcement,
      node_sources: nodeSources,
      proxy_nodes: proxyNodes,
      nodes_password_configured: Boolean(nodesPasswordHash)
    })
  };
}

export async function applyCommunityAdminAction(env: AdminEnv, request: Request) {
  const actor = await getCommunityAuthUser(env, request);
  if (!actor || !isCommunityAdminRole(actor.role)) {
    return { status: 403, body: { ok: false } };
  }

  let body: AdminActionRequest;
  try {
    body = (await request.json()) as AdminActionRequest;
  } catch {
    return { status: 400, body: { ok: false, msg: '请求内容无效' } };
  }

  await ensureDriveSchema(env);

  const action = String(body.action || '').trim();
  const targetType = String(body.target_type || '').trim();
  const targetId = String(body.target_id || '').trim();
  const reportId = String(body.report_id || '').trim();
  const actorIsOwner = isCommunityOwnerRole(actor.role);
  const targetUser = targetType === 'user' ? await getTargetCommunityUser(env, targetId) : null;
  const targetIsPrivileged = targetUser ? isCommunityAdminRole(targetUser.role) : false;
  const targetIsOwner = targetUser ? isCommunityOwnerRole(targetUser.role) : false;

  if (action === 'reset_password' && targetType === 'user') {
    if (!targetUser) return { status: 404, body: { ok: false, msg: '用户不存在' } };
    if (targetIsOwner) return { status: 403, body: { ok: false, msg: '不能重置 owner 账号密码' } };
    if (targetIsPrivileged && !actorIsOwner) return { status: 403, body: { ok: false, msg: '只有 owner 可以重置管理员密码' } };

    const nextPassword = String(body.new_password || '').trim();
    if (!nextPassword) return { status: 400, body: { ok: false, msg: '新密码不能为空' } };

    await env.COMMUNITY_DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(await sha256Hex(nextPassword), targetId)
      .run();
  } else if (action === 'set_drive_quota' && targetType === 'user') {
    if (!targetUser) return { status: 404, body: { ok: false, msg: '用户不存在' } };

    const quotaGb = Number(body.quota_gb);
    if (!Number.isFinite(quotaGb) || quotaGb < 0) {
      return { status: 400, body: { ok: false, msg: '网盘配额必须是非负数字' } };
    }

    await env.COMMUNITY_DB.prepare(
      'INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET quota_bytes = excluded.quota_bytes, updated_at = CURRENT_TIMESTAMP'
    )
      .bind(targetId, Math.round(quotaGb * 1024 * 1024 * 1024))
      .run();
  } else if (action === 'delete_item') {
    if (!targetId) return { status: 400, body: { ok: false, msg: '缺少目标内容' } };
    if (targetType === 'post') {
      await env.COMMUNITY_DB.prepare('DELETE FROM posts WHERE id = ?').bind(targetId).run();
    } else if (targetType === 'comment') {
      await env.COMMUNITY_DB.prepare('DELETE FROM comments WHERE id = ?').bind(targetId).run();
    }
    if (reportId) {
      await env.COMMUNITY_DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(reportId).run();
    }
  } else if (action === 'resolve_report') {
    if (!targetId) return { status: 400, body: { ok: false, msg: '缺少举报记录' } };
    await env.COMMUNITY_DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(targetId).run();
  } else if (action === 'ban_user' && targetType === 'user') {
    if (!targetUser) return { status: 404, body: { ok: false, msg: '用户不存在' } };
    if (targetIsPrivileged) return { status: 403, body: { ok: false, msg: '不能封禁管理员账号' } };
    await env.COMMUNITY_DB.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(targetId).run();
  } else if (action === 'unban_user' && targetType === 'user') {
    if (!targetUser) return { status: 404, body: { ok: false, msg: '用户不存在' } };
    if (targetIsPrivileged) return { status: 403, body: { ok: false, msg: '不能操作管理员账号' } };
    await env.COMMUNITY_DB.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').bind(targetId).run();
  } else if (action === 'grant_admin' && targetType === 'user') {
    if (!actorIsOwner) return { status: 403, body: { ok: false, msg: '只有 owner 可以授权管理员' } };
    if (!targetUser) return { status: 404, body: { ok: false, msg: '用户不存在' } };
    if (targetIsPrivileged) return { status: 400, body: { ok: false, msg: '该用户已是管理员' } };
    await env.COMMUNITY_DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(targetId).run();
  } else if (action === 'revoke_admin' && targetType === 'user') {
    if (!actorIsOwner) return { status: 403, body: { ok: false, msg: '只有 owner 可以撤销管理员' } };
    if (!targetUser) return { status: 404, body: { ok: false, msg: '用户不存在' } };
    if (targetId === actor.id) return { status: 400, body: { ok: false, msg: '不能撤销自己的管理员权限' } };
    if (targetIsOwner) return { status: 403, body: { ok: false, msg: '不能撤销 owner 权限' } };
    await env.COMMUNITY_DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(targetId).run();
  } else if (action === 'set_announcement') {
    await requireScheduleKv(env).put(
      'community_announcement',
      JSON.stringify({ content: String(body.content || '').trim(), updatedAt: new Date().toISOString() })
    );
  } else if (action === 'set_nodes_password') {
    const nextPassword = String(body.new_password || '').trim();
    if (!nextPassword) return { status: 400, body: { ok: false, msg: '节点访问密码不能为空' } };
    const store = requireScheduleKv(env);
    await store.put('proxy_nodes_password_hash', await sha256Hex(nextPassword));
    await store.put('nodes_user_pwd', nextPassword);
  } else if (action === 'create_node_source' || action === 'update_node_source') {
    const sources = await readNodeSources(env);
    const sourceId = String(body.source_id || '').trim() || crypto.randomUUID();
    const sourceType = String(body.source_type || 'manual').trim() || 'manual';
    const label = String(body.source_label || '').trim() || '未命名来源';
    const sourceUrl = String(body.source_url || '').trim();
    const sourceContent = typeof body.source_content === 'string' ? body.source_content : '';
    const parsedNodes = parseNodes(sourceContent);
    const record: NodeSourceRecord = {
      id: sourceId,
      source_type: sourceType,
      label,
      source_url: sourceUrl || null,
      source_content: sourceContent || null,
      enabled: body.enabled !== false,
      node_count: parsedNodes.length,
      last_error: parsedNodes.length === 0 ? '没有解析出可用节点' : null,
      updated_at: new Date().toISOString()
    };

    const existingIndex = sources.findIndex((source) => source.id === sourceId);
    if (existingIndex >= 0) {
      sources[existingIndex] = record;
    } else {
      sources.push(record);
    }

    await writeNodeSources(env, sources);
    await writeProxyNodes(env, mergeNodesFromSources(sources));
  } else if (action === 'delete_node_source') {
    const sourceId = String(body.source_id || targetId || '').trim();
    if (!sourceId) return { status: 400, body: { ok: false, msg: '缺少节点来源 ID' } };
    const nextSources = (await readNodeSources(env)).filter((source) => source.id !== sourceId);
    await writeNodeSources(env, nextSources);
    await writeProxyNodes(env, mergeNodesFromSources(nextSources));
  } else {
    return { status: 400, body: { ok: false, msg: '不支持的管理操作' } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      node_sources: await readNodeSources(env),
      proxy_nodes: await readProxyNodes(env),
      actor: actor.username
    }
  };
}
