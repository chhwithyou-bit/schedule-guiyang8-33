import { Hono } from 'hono';
import { ensureCommunityCoreSchema, getCommunityAuthUser, handleCommunityAuth, type CommunityAuthEnv, type D1DatabaseLike } from './routes/auth';
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
import { readCommunityMedia, uploadCommunityMedia } from './routes/community/media';

export interface Env {
  APP_NAME: string;
  COMMUNITY_DB: D1DatabaseLike;
  COMMUNITY_R2?: {
    put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void>;
    get(key: string): Promise<{ body?: ArrayBuffer; httpMetadata?: { contentType?: string } } | null>;
    delete(key: string): Promise<void>;
  };
  SCHEDULE_KV?: CommunityDriveKvLike;
  GDRIVE_FOLDER_ID?: string;
  GDRIVE_CLIENT_ID?: string;
  GDRIVE_CLIENT_SECRET?: string;
  GDRIVE_REFRESH_TOKEN?: string;
  COMMUNITY_MAX_UPLOAD_BYTES?: string | number;
}

const app = new Hono<{ Bindings: Env }>();

async function requireCommunityUser(env: Env, request: Request) {
  return await getCommunityAuthUser(env as CommunityAuthEnv, request);
}

function asCommunityDriveEnv(env: Env) {
  return env as CommunityDriveRuntimeEnv;
}

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: c.env.APP_NAME,
    message: 'API scaffold ready for Hono + community drive/media integration.'
  });
});

app.get('/health', (c) => {
  return c.json({
    ok: true,
    now: new Date().toISOString()
  });
});

app.post('/api/community/auth', async (c) => {
  const body = await c.req.json();
  const result = await handleCommunityAuth(c.env as CommunityAuthEnv, body);
  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
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

export default app;
