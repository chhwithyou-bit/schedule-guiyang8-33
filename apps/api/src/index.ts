import { Hono } from 'hono';
import { sha256Hex } from './middleware/auth/hash';
import { ensureCommunityCoreSchema, getCommunityAuthUser, handleCommunityAuth, type CommunityAuthEnv, type D1DatabaseLike } from './routes/auth';
import { applyCommunityAdminAction, getCommunityAdminData } from './routes/admin';
import { buildNodesPayload, parseNodes, type NodeSourceRecord, type ProxyNodeRecord } from './routes/nodes';
import { proxyJsonRequest } from './routes/proxy';
import { createCommunityChatMessage, listCommunityChatMessages, openDirectCommunityChat, listCommunityChats } from './routes/community/chats';
import { createCommunityComment, createCommunityReport, listCommunityComments } from './routes/community/comments';
import {
  buildCommunityStorageEnv,
  createDriveFolder,
  deleteDriveEntries,
  findDriveEntryByMediaKey,
  getDriveInfo,
  listDrive,
  renameDriveEntry,
  type CommunityDriveKvLike,
  type CommunityDriveRuntimeEnv,
  uploadDriveFile
} from './routes/community/drive';
import { buildCommunityDiscovery } from './routes/community/discovery';
import { toggleCommunityFollow, getCommunityProfile, updateCommunityProfile } from './routes/community/follows';
import { createCommunityGroup, joinCommunityGroup, listCommunityGroups } from './routes/community/groups';
import { readCommunityMedia, uploadCommunityMedia } from './routes/community/media';
import { listCommunityNotifications } from './routes/community/notifications';
import { createCommunityPost, deleteCommunityPost, listCommunityPosts, toggleCommunityLike } from './routes/community/posts';
import { handleMusicUpdate, readMusicPlaylist, serveMusicFile, type MusicBucket } from './routes/music';
import { readScheduleRaw, writeScheduleRaw } from './routes/schedule';

type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

type CommunityR2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  get(key: string): Promise<{ body?: ArrayBuffer; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

export interface Env {
  APP_NAME: string;
  GEMINI_API_KEY?: string;
  COMMUNITY_DB: D1DatabaseLike;
  MUSIC_BUCKET: MusicBucket;
  COMMUNITY_R2?: CommunityR2Like;
  SCHEDULE_KV?: KvLike & CommunityDriveKvLike;
  GDRIVE_FOLDER_ID?: string;
  GDRIVE_CLIENT_ID?: string;
  GDRIVE_CLIENT_SECRET?: string;
  GDRIVE_REFRESH_TOKEN?: string;
  COMMUNITY_MAX_UPLOAD_BYTES?: string | number;
}

const app = new Hono<{ Bindings: Env }>();

const DEFAULT_NODES_ADMIN_USER = 'admin';
const DEFAULT_NODES_ADMIN_PASS = 'admin888';
const DEFAULT_MUSIC_ADMIN_USER = 'admin';
const DEFAULT_MUSIC_ADMIN_PASS = 'admin888';

type NodeAdminActionBody = {
  action?: string;
  adminUser?: string;
  adminPass?: string;
  password?: string;
  label?: string;
  content?: string;
};

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, msg: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function requireScheduleKv(env: Env) {
  if (!env.SCHEDULE_KV) {
    throw new Error('SCHEDULE_KV binding is required');
  }
  return env.SCHEDULE_KV;
}

function getBaseUrl(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function requireCommunityUser(env: Env, request: Request) {
  await ensureCommunityCoreSchema(env as CommunityAuthEnv);
  const user = await getCommunityAuthUser(env as CommunityAuthEnv, request);
  if (!user) return null;
  return user;
}

function asCommunityDriveEnv(env: Env) {
  return env as CommunityDriveRuntimeEnv;
}

async function verifyMusicAdmin(env: Env, username: string, password: string) {
  const storedUser = (await env.SCHEDULE_KV?.get?.('nodes_admin_user')) || DEFAULT_MUSIC_ADMIN_USER;
  const storedPass = (await env.SCHEDULE_KV?.get?.('nodes_admin_pass')) || DEFAULT_MUSIC_ADMIN_PASS;
  return username === storedUser && password === storedPass;
}

async function readAnnouncement(env: Env) {
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

async function readNodeSources(env: Env): Promise<NodeSourceRecord[]> {
  const raw = await requireScheduleKv(env).get('proxy_node_sources');
  if (!raw) return [];

  try {
    return JSON.parse(raw) as NodeSourceRecord[];
  } catch {
    return [];
  }
}

async function writeNodeSources(env: Env, sources: NodeSourceRecord[]) {
  await requireScheduleKv(env).put('proxy_node_sources', JSON.stringify(sources));
}

async function readProxyNodes(env: Env): Promise<ProxyNodeRecord[]> {
  const kv = requireScheduleKv(env);
  const raw = await kv.get('proxy_nodes');
  if (raw) {
    try {
      return JSON.parse(raw) as ProxyNodeRecord[];
    } catch {
      // fall through to legacy storage
    }
  }

  const legacy = await kv.get('nodes_list');
  if (!legacy) return [];

  try {
    return JSON.parse(legacy) as ProxyNodeRecord[];
  } catch {
    return [];
  }
}

async function writeProxyNodes(env: Env, nodes: ProxyNodeRecord[]) {
  const payload = JSON.stringify(nodes);
  const kv = requireScheduleKv(env);
  await kv.put('proxy_nodes', payload);
  await kv.put('nodes_list', payload);
}

async function readNodePasswordHash(env: Env) {
  const kv = requireScheduleKv(env);
  const storedHash = (await kv.get('proxy_nodes_password_hash')) || '';
  if (storedHash.trim()) return storedHash.trim();

  const legacyPassword = (await kv.get('nodes_user_pwd')) || '';
  if (!legacyPassword.trim()) return '';

  const migratedHash = await sha256Hex(legacyPassword.trim());
  await kv.put('proxy_nodes_password_hash', migratedHash);
  return migratedHash;
}

async function verifyNodePassword(env: Env, password: string) {
  const expectedHash = await readNodePasswordHash(env);
  if (!expectedHash) return false;
  return (await sha256Hex(password.trim())) === expectedHash;
}

async function verifyNodeAdmin(env: Env, username: string, password: string) {
  const kv = requireScheduleKv(env);
  const storedUser = ((await kv.get('nodes_admin_user')) || DEFAULT_NODES_ADMIN_USER).trim() || DEFAULT_NODES_ADMIN_USER;
  const storedPass = ((await kv.get('nodes_admin_pass')) || DEFAULT_NODES_ADMIN_PASS).trim() || DEFAULT_NODES_ADMIN_PASS;
  return username === storedUser && password === storedPass;
}

function attachSourceMetadata(nodes: ProxyNodeRecord[], sourceId: string, sourceLabel: string) {
  return nodes.map((node) => ({
    ...node,
    source_id: sourceId,
    source_label: sourceLabel
  }));
}

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: c.env.APP_NAME,
    message: 'API scaffold ready for Hono + Drizzle integration.'
  });
});

app.get('/health', (c) => {
  return c.json({
    ok: true,
    now: new Date().toISOString()
  });
});

app.get('/api/music', async (c) => {
  try {
    const url = new URL(c.req.url);
    const list = await readMusicPlaylist(c.env.MUSIC_BUCKET, url.origin, url.host);
    return c.json(list);
  } catch (error) {
    return c.json({ ok: false, msg: error instanceof Error ? error.message : '音乐歌单读取失败' }, 500);
  }
});

app.post('/api/music', async (c) => {
  try {
    const body = await c.req.json();
    const result = await handleMusicUpdate(c.env.MUSIC_BUCKET, (username, password) => verifyMusicAdmin(c.env, username, password), body);
    if (!result.ok) {
      return c.json({ ok: false, msg: result.msg }, result.status as 400 | 401);
    }
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ ok: false, msg: error instanceof Error ? error.message : '音乐歌单保存失败' }, 500);
  }
});

app.get('/api/music/file/:key{.+}', async (c) => {
  try {
    return await serveMusicFile(c.env.MUSIC_BUCKET, c.req.param('key'));
  } catch (error) {
    return c.json({ ok: false, msg: error instanceof Error ? error.message : '音乐文件读取失败' }, 500);
  }
});

app.post('/api/community/auth', async (c) => {
  const body = await c.req.json();
  const result = await handleCommunityAuth(c.env as CommunityAuthEnv, body);
  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
});

app.get('/api/community/posts', async (c) => {
  const result = await listCommunityPosts(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.post('/api/community/posts', async (c) => {
  const result = await createCommunityPost(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.delete('/api/community/posts', async (c) => {
  const result = await deleteCommunityPost(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 404 | 500);
});

app.post('/api/community/like', async (c) => {
  const result = await toggleCommunityLike(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.get('/api/community/comments', async (c) => {
  const result = await listCommunityComments(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 404 | 500);
});

app.post('/api/community/comments', async (c) => {
  const result = await createCommunityComment(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.post('/api/community/report', async (c) => {
  const result = await createCommunityReport(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 500);
});

app.post('/api/community/follow', async (c) => {
  const result = await toggleCommunityFollow(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 500);
});

app.get('/api/community/profile', async (c) => {
  const result = await getCommunityProfile(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 404 | 500);
});

app.post('/api/community/profile', async (c) => {
  const result = await updateCommunityProfile(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 500);
});

app.get('/api/community/notifications', async (c) => {
  const result = await listCommunityNotifications(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 401 | 500);
});

app.get('/api/community/discovery', async (c) => {
  const result = await buildCommunityDiscovery(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 500);
});

app.get('/api/community/groups', async (c) => {
  const result = await listCommunityGroups(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 500);
});

app.post('/api/community/groups', async (c) => {
  const result = await createCommunityGroup(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 500);
});

app.post('/api/community/groups/join', async (c) => {
  const result = await joinCommunityGroup(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.get('/api/community/chats', async (c) => {
  const result = await listCommunityChats(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 401 | 500);
});

app.post('/api/community/chats/direct', async (c) => {
  const result = await openDirectCommunityChat(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.get('/api/community/chats/messages', async (c) => {
  const result = await listCommunityChatMessages(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.post('/api/community/chats/messages', async (c) => {
  const result = await createCommunityChatMessage(c.env as CommunityAuthEnv, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 500);
});

app.get('/api/community/announcement', async (c) => {
  return c.json({ ok: true, announcement: await readAnnouncement(c.env) });
});

app.get('/api/community/admin/data', async (c) => {
  const result = await getCommunityAdminData(c.env as CommunityAuthEnv & Env, c.req.raw);
  return c.json(result.body, result.status as 200 | 403 | 500);
});

app.post('/api/community/admin/action', async (c) => {
  const result = await applyCommunityAdminAction(c.env as CommunityAuthEnv & Env, c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 403 | 404 | 500);
});

app.get('/api/community/drive/info', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
  return c.json(await getDriveInfo({ env: storageEnv, user }), 200);
});

app.get('/api/community/drive/list', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
  return c.json(await listDrive({ env: storageEnv, user }, new URL(c.req.url).searchParams), 200);
});

app.post('/api/community/drive/mkdir', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  try {
    const body = await c.req.json<{ name?: string; parent_id?: string | null }>();
    const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
    return c.json(await createDriveFolder({ env: storageEnv, user }, body), 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '创建文件夹失败';
    return c.json({ ok: false, msg }, (msg.includes('不存在') ? 404 : msg.includes('同名') ? 409 : 500) as 404 | 409 | 500);
  }
});

app.post('/api/community/drive/rename', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  try {
    const body = await c.req.json<{ id?: string; name?: string }>();
    if (!String(body.id || '').trim()) return c.json({ ok: false, msg: '缺少文件 ID' }, 400);
    const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
    const result = await renameDriveEntry({ env: storageEnv, user }, body);
    return c.json(result, result.ok ? 200 : 404);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '重命名失败';
    return c.json({ ok: false, msg }, (msg.includes('同名') ? 409 : 500) as 409 | 500);
  }
});

app.post('/api/community/drive/delete', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  try {
    const body = await c.req.json<{ ids?: string[]; id?: string }>();
    const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
    return c.json(await deleteDriveEntries({ env: storageEnv, user }, body), 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '删除失败';
    return c.json({ ok: false, msg }, 500);
  }
});

app.post('/api/community/drive/upload', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const parentId = formData.get('parent_id');
    if (!(file instanceof File) || !file.name) return c.json({ ok: false, msg: '没有收到文件' }, 400);
    if (typeof file.size !== 'number' || file.size <= 0) return c.json({ ok: false, msg: '文件内容为空' }, 400);
    const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
    const result = await uploadDriveFile({ env: storageEnv, user }, {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      bytes: await file.arrayBuffer(),
      parentId: parentId ? String(parentId) : null
    });
    return c.json(result, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '上传失败';
    return c.json({ ok: false, msg }, (msg.includes('空间不足') ? 403 : msg.includes('不存在') ? 404 : 500) as 403 | 404 | 500);
  }
});

app.post('/api/community/upload', async (c) => {
  const user = await requireCommunityUser(c.env, c.req.raw);
  if (!user) return c.json({ ok: false, msg: '请先登录' }, 401);
  try {
    const bytes = await c.req.arrayBuffer();
    const contentType = c.req.header('content-type') || 'image/jpeg';
    const storageEnv = await buildCommunityStorageEnv(asCommunityDriveEnv(c.env));
    const result = await uploadCommunityMedia(storageEnv, user.id, {
      fileName: `img_${Date.now()}`,
      contentType,
      size: bytes.byteLength,
      bytes
    });
    return c.json({ ok: true, fileId: result.fileId, id: result.id, url: result.url, fromDrive: true, backend: result.backend, cacheStatus: result.cacheStatus, file: result.file }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Drive 发布失败';
    return c.json({ ok: false, msg: `Drive 发布失败: ${msg}` }, 500);
  }
});

app.get('/api/community/media/:fileId{.+}', async (c) => {
  const fileId = c.req.param('fileId');
  const runtimeEnv = asCommunityDriveEnv(c.env);
  const storageEnv = await buildCommunityStorageEnv(runtimeEnv);
  const hintEntry = await findDriveEntryByMediaKey(runtimeEnv, fileId);
  const result = await readCommunityMedia(storageEnv, fileId, hintEntry ? { storageKey: hintEntry.storageKey, legacyFileId: hintEntry.legacyFileId } : null);
  if (!result.ok || !result.bytes) return new Response('Media Not Found', { status: 404 });
  return new Response(result.bytes, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': result.contentType || 'application/octet-stream',
      'X-Cache': result.cacheStatus || (result.backend === 'r2-cache' ? 'HIT-R2' : 'MISS-GDrive'),
      'Cache-Control': 'public, max-age=31536000'
    }
  });
});

app.post('/api/proxy-gemini', async (c) => {
  if (!c.env.GEMINI_API_KEY) {
    return c.json({ ok: false, msg: 'GEMINI_API_KEY 未配置' }, 500);
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, msg: '请求体不是合法 JSON' }, 400);
  }

  const result = await proxyJsonRequest(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    c.env.GEMINI_API_KEY,
    payload as { contents: unknown[] }
  );

  return new Response(result.body, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType
    }
  });
});

app.get('/api/nodes', async (c) => {
  const password = c.req.query('pwd') || '';
  if (!(await verifyNodePassword(c.env, password))) {
    return c.json({ ok: false, msg: '无权访问' }, 401);
  }

  const nodes = await readProxyNodes(c.env);
  const sources = await readNodeSources(c.env);
  return c.json(buildNodesPayload(getBaseUrl(c.req.raw), password, nodes, sources));
});

app.get('/api/nodes/subscription', async (c) => {
  const password = c.req.query('pwd') || '';
  if (!(await verifyNodePassword(c.env, password))) {
    return c.json({ ok: false, msg: '无权访问' }, 401);
  }

  const body = (await readProxyNodes(c.env)).map((node) => node.raw).join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
});

app.post('/api/nodes', async (c) => {
  const body = await c.req.json<NodeAdminActionBody>();
  if (!(await verifyNodeAdmin(c.env, body.adminUser || '', body.adminPass || ''))) {
    return c.json({ ok: false, msg: '认证失败' }, 401);
  }

  if (body.action === 'getNodes') {
    return c.json({
      ok: true,
      nodes: await readProxyNodes(c.env),
      sources: await readNodeSources(c.env),
      password_configured: Boolean(await readNodePasswordHash(c.env))
    });
  }

  if (body.action === 'clearNodes') {
    await writeProxyNodes(c.env, []);
    return c.json({ ok: true });
  }

  if (body.action === 'setPassword') {
    const nextPassword = (body.password || '').trim();
    const kv = requireScheduleKv(c.env);
    await kv.put('proxy_nodes_password_hash', await sha256Hex(nextPassword));
    await kv.put('nodes_user_pwd', nextPassword);
    return c.json({ ok: true });
  }

  if (body.action === 'importText') {
    const label = (body.label || '').trim() || '手工导入';
    const content = body.content || '';
    const sourceId = crypto.randomUUID();
    const parsedNodes = attachSourceMetadata(parseNodes(content), sourceId, label);
    const source: NodeSourceRecord = {
      id: sourceId,
      source_type: 'manual',
      label,
      source_url: null,
      source_content: content,
      enabled: true,
      node_count: parsedNodes.length,
      last_error: null,
      updated_at: new Date().toISOString()
    };

    const sources = await readNodeSources(c.env);
    sources.push(source);
    const nodes = await readProxyNodes(c.env);
    nodes.push(...parsedNodes);
    await writeNodeSources(c.env, sources);
    await writeProxyNodes(c.env, nodes);
    return c.json({ ok: true, source, nodes });
  }

  return c.json({ ok: false, msg: '未知操作' }, 400);
});

async function handleScheduleRead(c: { env: Env }) {
  const raw = await readScheduleRaw(c.env.SCHEDULE_KV);
  return new Response(raw, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleScheduleWrite(c: { env: Env; req: { text(): Promise<string> } }) {
  const store = requireScheduleKv(c.env);
  const raw = await c.req.text();
  await writeScheduleRaw(store, raw);
  return Response.json({ ok: true });
}

app.get('/api/schedule', (c) => handleScheduleRead(c));
app.post('/api/schedule', (c) => handleScheduleWrite(c));
app.get('/api/data', (c) => handleScheduleRead(c));
app.post('/api/data', (c) => handleScheduleWrite(c));

export default app;
