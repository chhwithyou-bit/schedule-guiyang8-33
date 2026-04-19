import { createCommunityStorage } from '../../../lib/storage/community-storage';
import type { CommunityStorageEnv } from '../../../lib/storage/types';

export type DriveRouteContext = {
  env: CommunityStorageEnv;
  user: { id: string };
};

export async function getDriveInfo(context: DriveRouteContext) {
  const storage = createCommunityStorage(context.env);
  return { ok: true, stats: await storage.info(context.user.id) };
}

export async function listDrive(context: DriveRouteContext, query: URLSearchParams) {
  const storage = createCommunityStorage(context.env);
  const parentId = query.get('parent_id');
  const files = await storage.listDrive(context.user.id, parentId);
  return { ok: true, files };
}

export async function createDriveFolder(context: DriveRouteContext, body: { name?: string; parent_id?: string | null }) {
  const storage = createCommunityStorage(context.env);
  const folder = await storage.mkdir(context.user.id, String(body.name || '新建文件夹'), body.parent_id);
  return { ok: true, id: folder.id, folder };
}

export async function renameDriveEntry(context: DriveRouteContext, body: { id?: string; name?: string }) {
  const storage = createCommunityStorage(context.env);
  const item = await storage.rename(context.user.id, String(body.id || ''), String(body.name || ''));
  if (!item) {
    return { ok: false, msg: '文件不存在' };
  }
  return { ok: true, item };
}

export async function deleteDriveEntries(context: DriveRouteContext, body: { ids?: string[]; id?: string }) {
  const storage = createCommunityStorage(context.env);
  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  return { ok: true, ...(await storage.remove(context.user.id, ids)) };
}

export async function uploadDriveFile(
  context: DriveRouteContext,
  input: { fileName: string; contentType: string; size: number; bytes: ArrayBuffer | Uint8Array; parentId?: string | null }
) {
  const storage = createCommunityStorage(context.env);
  const result = await storage.upload({
    userId: context.user.id,
    fileName: input.fileName,
    contentType: input.contentType,
    size: input.size,
    bytes: input.bytes,
    parentId: input.parentId
  });
  return { ok: true, ...result };
}
