import { createCommunityStorage } from '../../../lib/storage/community-storage';
import type { CommunityStorageEnv, DriveEntryRecord } from '../../../lib/storage/types';

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
    url: result.url,
    backend: result.backend,
    cacheStatus: result.cacheStatus,
    file: result.file
  };
}
