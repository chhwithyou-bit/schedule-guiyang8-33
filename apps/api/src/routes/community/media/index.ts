import { createCommunityStorage } from '../../../lib/storage/community-storage';
import type { CommunityStorageEnv, DriveEntryRecord } from '../../../lib/storage/types';

function toLegacyEntry(entry: DriveEntryRecord) {
  return {
    id: entry.id,
    user_id: entry.userId,
    name: entry.name,
    size: entry.size,
    mime_type: entry.mimeType,
    url: entry.url,
    parent_id: entry.parentId,
    is_folder: entry.isFolder ? 1 : 0,
    storage_key: entry.storageKey || null,
    legacy_file_id: entry.legacyFileId || null,
    created_at: entry.createdAt || null,
    updated_at: entry.updatedAt || null,
    backend: entry.backend,
    previewable: !entry.isFolder && /^(image|audio|video)\//.test(String(entry.mimeType || '').toLowerCase())
  };
}

export async function readCommunityMedia(env: CommunityStorageEnv, fileId: string, hint?: Pick<DriveEntryRecord, 'storageKey' | 'legacyFileId'> | null) {
  const storage = createCommunityStorage(env);
  return await storage.readMedia(fileId, hint || null);
}

export async function uploadCommunityMedia(
  env: CommunityStorageEnv,
  userId: string,
  input: { fileName: string; contentType: string; size: number; bytes: ArrayBuffer | Uint8Array }
) {
  const storage = createCommunityStorage(env);
  const result = await storage.upload({
    userId,
    fileName: input.fileName,
    contentType: input.contentType,
    size: input.size,
    bytes: input.bytes,
    parentId: null
  });

  return {
    ok: true,
    fileId: result.fileId,
    id: result.id,
    url: result.url,
    backend: result.backend,
    cacheStatus: result.cacheStatus,
    file: toLegacyEntry(result.file)
  };
}
