import {
  type CommunityStorageEnv,
  type DriveEntryRecord,
  type DriveStatsRecord,
  type MediaReadResult,
  type UploadInput,
  type UploadResult
} from './types';

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  return new Uint8Array(bytes).buffer;
}

function extFromMime(contentType: string): string {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'audio/mpeg') return 'mp3';
  return 'bin';
}

function normalizeName(name: string, fallback = '未命名文件'): string {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback;
}

function normalizeParentId(parentId?: string | null): string | null {
  const value = String(parentId || '').trim();
  return value || null;
}

function mediaUrl(basePath: string | undefined, key: string): string {
  return `${basePath || '/api/community/media'}/${encodeURIComponent(key)}`;
}

function createCacheKey(userId: string, entryId: string, contentType: string): string {
  return `community-cache/${userId}/${entryId}.${extFromMime(contentType)}`;
}

function computeAvailable(stats: Pick<DriveStatsRecord, 'quotaBytes' | 'usedBytes'>): DriveStatsRecord {
  const quotaBytes = Math.max(0, Number(stats.quotaBytes || 0));
  const usedBytes = Math.max(0, Number(stats.usedBytes || 0));
  return {
    quotaBytes,
    usedBytes,
    availableBytes: Math.max(0, quotaBytes - usedBytes)
  };
}

function isValidMediaUrl(url: string): boolean {
  const value = String(url || '').trim();
  return value.startsWith('/api/community/media/') || value.startsWith('http://') || value.startsWith('https://');
}

export function normalizeDriveEntry(entry: Partial<DriveEntryRecord>): DriveEntryRecord {
  const name = normalizeName(entry.name || '', entry.isFolder ? '未命名文件夹' : '未命名文件');
  const storageKey = String(entry.storageKey || entry.legacyFileId || entry.id || '').trim();
  const isFolder = Boolean(entry.isFolder);
  return {
    id: String(entry.id || ''),
    userId: String(entry.userId || ''),
    name,
    size: Math.max(0, Number(entry.size || 0)),
    mimeType: String(entry.mimeType || ''),
    url: isFolder ? '' : (isValidMediaUrl(String(entry.url || '')) ? String(entry.url || '') : mediaUrl(undefined, storageKey)),
    parentId: normalizeParentId(entry.parentId),
    isFolder,
    backend: 'gdrive',
    storageKey: storageKey || undefined,
    legacyFileId: entry.legacyFileId ? String(entry.legacyFileId) : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

export function createCommunityStorage(env: CommunityStorageEnv) {
  const maxUploadBytes = Math.max(1, Number(env.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES));

  async function cacheInR2(cacheKey: string, bytes: ArrayBuffer, contentType: string) {
    if (!env.r2) return 'skipped' as const;
    await env.r2.put(cacheKey, bytes, { httpMetadata: { contentType } });
    return 'cached' as const;
  }

  async function upload(input: UploadInput): Promise<UploadResult> {
    const size = Math.max(0, Number(input.size || 0));
    if (!size) throw new Error('文件内容为空');
    if (size > maxUploadBytes) throw new Error('文件太大，暂不支持上传');
    if (!env.googleDrive) throw new Error('Google Drive 未配置');

    const stats = await env.driveRepo.ensureStats(input.userId);
    if (stats.quotaBytes > 0 && stats.usedBytes + size > stats.quotaBytes) {
      throw new Error('空间不足');
    }

    const id = crypto.randomUUID();
    const fileName = normalizeName(input.fileName);
    const contentType = String(input.contentType || 'application/octet-stream');
    const bytes = toArrayBuffer(input.bytes);
    const parentId = normalizeParentId(input.parentId);
    const uploaded = await env.googleDrive.upload({ fileName, contentType, bytes });
    const cacheKey = createCacheKey(input.userId, id, contentType);
    const cacheStatus = await cacheInR2(cacheKey, bytes, contentType);

    const entry = normalizeDriveEntry({
      id,
      userId: input.userId,
      name: fileName,
      size,
      mimeType: contentType,
      url: mediaUrl(env.publicMediaBasePath, uploaded.fileId),
      parentId,
      isFolder: false,
      backend: 'gdrive',
      storageKey: cacheKey,
      legacyFileId: uploaded.fileId,
      createdAt: input.now?.toISOString(),
      updatedAt: input.now?.toISOString()
    });

    await env.driveRepo.save(entry);
    const nextStats = await env.driveRepo.updateStats(input.userId, size);

    return {
      id,
      fileId: uploaded.fileId,
      url: entry.url,
      backend: 'gdrive',
      cacheStatus,
      file: entry,
      stats: nextStats
    };
  }

  async function readMedia(fileId: string, hint?: Pick<DriveEntryRecord, 'storageKey' | 'legacyFileId'> | null): Promise<MediaReadResult> {
    const requestedId = decodeURIComponent(String(fileId || '').trim());
    if (!requestedId) return { ok: false, status: 404 };

    const cacheKeys = [String(hint?.storageKey || '').trim()].filter(Boolean);
    if (env.r2) {
      for (const key of cacheKeys) {
        const object = await env.r2.get(key);
        if (object?.body) {
          return {
            ok: true,
            status: 200,
            backend: 'r2-cache',
            bytes: object.body,
            contentType: object.httpMetadata?.contentType || 'application/octet-stream',
            cacheStatus: 'HIT-R2'
          };
        }
      }
    }

    const driveKeys = [String(hint?.legacyFileId || '').trim(), requestedId].filter(Boolean);
    if (env.googleDrive) {
      for (const key of driveKeys) {
        const object = await env.googleDrive.read(key);
        if (object) {
          const cacheKey = cacheKeys[0];
          if (cacheKey && env.r2) {
            await env.r2.put(cacheKey, object.bytes, { httpMetadata: { contentType: object.contentType } });
          }
          return {
            ok: true,
            status: 200,
            backend: 'gdrive',
            bytes: object.bytes,
            contentType: object.contentType || 'application/octet-stream',
            cacheStatus: cacheKey && env.r2 ? 'MISS-GDrive-CACHED' : 'MISS-GDrive'
          };
        }
      }
    }

    return { ok: false, status: 404 };
  }

  async function listDrive(userId: string, parentId?: string | null) {
    const files = await env.driveRepo.list({ userId, parentId: normalizeParentId(parentId) });
    return files.map((entry) => normalizeDriveEntry(entry));
  }

  async function mkdir(userId: string, name: string, parentId?: string | null) {
    const folder = normalizeDriveEntry({
      id: crypto.randomUUID(),
      userId,
      name,
      size: 0,
      mimeType: '',
      url: '',
      parentId: normalizeParentId(parentId),
      isFolder: true,
      backend: 'gdrive'
    });
    await env.driveRepo.createFolder(folder);
    return folder;
  }

  async function rename(userId: string, id: string, name: string) {
    const renamed = await env.driveRepo.rename({ userId, id, name: normalizeName(name) });
    return renamed ? normalizeDriveEntry(renamed) : null;
  }

  async function remove(userId: string, ids: string[]) {
    const deletedIds = ids.map((value) => String(value || '').trim()).filter(Boolean);
    if (deletedIds.length === 0) return { deleted: 0, deletedItems: [], stats: await env.driveRepo.getStats(userId) };

    const entries = await env.driveRepo.getByIds({ userId, ids: deletedIds });
    for (const entry of entries) {
      if (entry.storageKey && env.r2) {
        await env.r2.delete(entry.storageKey).catch(() => undefined);
      }
    }

    const result = await env.driveRepo.remove({ userId, ids: deletedIds });
    return {
      deleted: result.deleted.length,
      deletedItems: result.deleted.map((entry) => normalizeDriveEntry(entry)),
      stats: computeAvailable(result.stats)
    };
  }

  async function info(userId: string) {
    const stats = await env.driveRepo.ensureStats(userId);
    return computeAvailable(stats);
  }

  return {
    upload,
    readMedia,
    listDrive,
    mkdir,
    rename,
    remove,
    info,
    normalizeDriveEntry
  };
}
