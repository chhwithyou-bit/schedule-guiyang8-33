import { createCommunityStorage } from '../../../lib/storage/community-storage';
import type {
  CommunityStorageEnv,
  DriveEntryRecord,
  DriveRepository,
  DriveStatsRecord,
  GoogleDriveLike,
  R2LikeBucket
} from '../../../lib/storage/types';
import type { CommunityAuthEnv, D1DatabaseLike } from '../../auth';

export type CommunityDriveKvLike = {
  get(key: string): Promise<string | null>;
  put?(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type CommunityDriveRuntimeEnv = CommunityAuthEnv & {
  COMMUNITY_DB: D1DatabaseLike;
  COMMUNITY_R2?: R2LikeBucket | null;
  SCHEDULE_KV?: CommunityDriveKvLike;
  GDRIVE_FOLDER_ID?: string;
  GDRIVE_CLIENT_ID?: string;
  GDRIVE_CLIENT_SECRET?: string;
  GDRIVE_REFRESH_TOKEN?: string;
  COMMUNITY_MAX_UPLOAD_BYTES?: string | number;
};

export type DriveRouteContext = {
  env: CommunityStorageEnv;
  user: { id: string };
};

let driveSchemaPromise: Promise<void> | null = null;

function normalizeParentId(parentId?: string | null) {
  const value = String(parentId || '').trim();
  return value || null;
}

function normalizeDriveName(value: string, fallback = '未命名文件') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback;
}

function isPreviewableMime(mimeType: string) {
  const mime = String(mimeType || '').toLowerCase();
  return mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/');
}

function toLegacyStats(stats: DriveStatsRecord) {
  return {
    quota_bytes: stats.quotaBytes,
    used_bytes: stats.usedBytes,
    available_bytes: stats.availableBytes,
    quotaBytes: stats.quotaBytes,
    usedBytes: stats.usedBytes,
    availableBytes: stats.availableBytes
  };
}

function toLegacyEntry(entry: DriveEntryRecord) {
  return {
    id: entry.id,
    user_id: entry.userId,
    userId: entry.userId,
    name: entry.name,
    size: entry.size,
    mime_type: entry.mimeType,
    mimeType: entry.mimeType,
    url: entry.url,
    parent_id: entry.parentId,
    parentId: entry.parentId,
    is_folder: entry.isFolder ? 1 : 0,
    isFolder: entry.isFolder,
    backend: entry.backend,
    storage_key: entry.storageKey || null,
    storageKey: entry.storageKey || null,
    legacy_file_id: entry.legacyFileId || null,
    legacyFileId: entry.legacyFileId || null,
    created_at: entry.createdAt || null,
    createdAt: entry.createdAt || null,
    updated_at: entry.updatedAt || null,
    updatedAt: entry.updatedAt || null,
    previewable: !entry.isFolder && isPreviewableMime(entry.mimeType)
  };
}

async function runStatement(env: CommunityDriveRuntimeEnv, sql: string, bindings: unknown[] = []) {
  await env.COMMUNITY_DB.prepare(sql).bind(...bindings).run();
}

async function runStatementIgnoreDuplicateColumn(env: CommunityDriveRuntimeEnv, sql: string) {
  try {
    await env.COMMUNITY_DB.prepare(sql).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name/i.test(message)) {
      throw error;
    }
  }
}

export async function ensureDriveSchema(env: CommunityDriveRuntimeEnv) {
  if (!driveSchemaPromise) {
    driveSchemaPromise = (async () => {
      await runStatement(
        env,
        `CREATE TABLE IF NOT EXISTS user_drive_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          quota_bytes INTEGER DEFAULT 0,
          used_bytes INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      );
      await runStatement(
        env,
        `CREATE TABLE IF NOT EXISTS drive_files (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          mime_type TEXT,
          url TEXT,
          parent_id TEXT,
          is_folder INTEGER DEFAULT 0,
          storage_key TEXT,
          legacy_file_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      );
      await runStatementIgnoreDuplicateColumn(env, 'ALTER TABLE drive_files ADD COLUMN storage_key TEXT');
      await runStatementIgnoreDuplicateColumn(env, 'ALTER TABLE drive_files ADD COLUMN legacy_file_id TEXT');
      await runStatement(env, 'CREATE INDEX IF NOT EXISTS idx_drive_files_user ON drive_files(user_id, parent_id)');
      await runStatement(env, 'CREATE INDEX IF NOT EXISTS idx_drive_files_parent ON drive_files(parent_id)');
      await runStatement(env, 'CREATE INDEX IF NOT EXISTS idx_drive_files_legacy_file_id ON drive_files(legacy_file_id)');
      await runStatement(env, 'CREATE INDEX IF NOT EXISTS idx_drive_files_storage_key ON drive_files(storage_key)');
    })().catch((error) => {
      driveSchemaPromise = null;
      throw error;
    });
  }

  return driveSchemaPromise;
}

function computeAvailable(record: Record<string, unknown> | null | undefined): DriveStatsRecord {
  const quotaBytes = Math.max(0, Number(record?.quota_bytes || record?.quotaBytes || 0));
  const usedBytes = Math.max(0, Number(record?.used_bytes || record?.usedBytes || 0));
  return {
    quotaBytes,
    usedBytes,
    availableBytes: Math.max(0, quotaBytes - usedBytes)
  };
}

function mapDriveEntry(record: Record<string, unknown> | null | undefined): DriveEntryRecord | null {
  if (!record) return null;
  const isFolder = Number(record.is_folder || 0) === 1 || record.isFolder === true;
  return {
    id: String(record.id || ''),
    userId: String(record.user_id || record.userId || ''),
    name: normalizeDriveName(String(record.name || ''), isFolder ? '未命名文件夹' : '未命名文件'),
    size: Math.max(0, Number(record.size || 0)),
    mimeType: String(record.mime_type || record.mimeType || ''),
    url: String(record.url || ''),
    parentId: normalizeParentId(String(record.parent_id || record.parentId || '')),
    isFolder,
    backend: 'gdrive',
    storageKey: record.storage_key ? String(record.storage_key) : record.storageKey ? String(record.storageKey) : undefined,
    legacyFileId: record.legacy_file_id ? String(record.legacy_file_id) : record.legacyFileId ? String(record.legacyFileId) : null,
    createdAt: typeof record.created_at === 'string' ? record.created_at : typeof record.createdAt === 'string' ? record.createdAt : undefined,
    updatedAt: typeof record.updated_at === 'string' ? record.updated_at : typeof record.updatedAt === 'string' ? record.updatedAt : undefined
  };
}

async function getStatsRecord(env: CommunityDriveRuntimeEnv, userId: string) {
  await ensureDriveSchema(env);
  const record = await env.COMMUNITY_DB.prepare(
    'SELECT quota_bytes, used_bytes FROM user_drive_stats WHERE user_id = ? LIMIT 1'
  )
    .bind(userId)
    .first<Record<string, unknown>>();
  return computeAvailable(record);
}

async function ensureStatsRecord(env: CommunityDriveRuntimeEnv, userId: string) {
  await ensureDriveSchema(env);
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes, updated_at)
     VALUES (?, 0, 0, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO NOTHING`
  )
    .bind(userId)
    .run();
  return await getStatsRecord(env, userId);
}

async function updateStatsRecord(env: CommunityDriveRuntimeEnv, userId: string, sizeDelta: number) {
  await ensureDriveSchema(env);
  const safeDelta = Number(sizeDelta || 0);
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes, updated_at)
     VALUES (?, 0, MAX(0, ?), CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       used_bytes = MAX(0, user_drive_stats.used_bytes + ?),
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(userId, safeDelta, safeDelta)
    .run();
  return await getStatsRecord(env, userId);
}

async function getDriveEntry(env: CommunityDriveRuntimeEnv, userId: string, id: string) {
  await ensureDriveSchema(env);
  const record = await env.COMMUNITY_DB.prepare(
    `SELECT id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
     FROM drive_files
     WHERE id = ? AND user_id = ?
     LIMIT 1`
  )
    .bind(id, userId)
    .first<Record<string, unknown>>();
  return mapDriveEntry(record);
}

async function assertParentFolder(env: CommunityDriveRuntimeEnv, userId: string, parentId?: string | null, missingMessage = '目标目录不存在') {
  const normalizedParentId = normalizeParentId(parentId);
  if (!normalizedParentId) return null;
  const parent = await getDriveEntry(env, userId, normalizedParentId);
  if (!parent || !parent.isFolder) {
    throw new Error(missingMessage);
  }
  return parent;
}

async function ensureNoDuplicateName(
  env: CommunityDriveRuntimeEnv,
  userId: string,
  name: string,
  parentId?: string | null,
  excludeId?: string
) {
  await ensureDriveSchema(env);
  const normalizedParentId = normalizeParentId(parentId);
  const query = excludeId
    ? `SELECT id FROM drive_files
       WHERE user_id = ? AND id != ? AND name = ? AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
       LIMIT 1`
    : `SELECT id FROM drive_files
       WHERE user_id = ? AND name = ? AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
       LIMIT 1`;
  const statement = env.COMMUNITY_DB.prepare(query);
  const duplicate = excludeId
    ? await statement.bind(userId, excludeId, name, normalizedParentId, normalizedParentId).first<Record<string, unknown>>()
    : await statement.bind(userId, name, normalizedParentId, normalizedParentId).first<Record<string, unknown>>();
  if (duplicate) {
    throw new Error(excludeId ? '当前目录下已有同名文件' : '同名文件夹已存在');
  }
}

async function collectEntriesForDeletion(env: CommunityDriveRuntimeEnv, userId: string, ids: string[]) {
  await ensureDriveSchema(env);
  const queue = Array.from(new Set(ids.map((value) => String(value || '').trim()).filter(Boolean)));
  const visited = new Set<string>();
  const entries: DriveEntryRecord[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const entry = await getDriveEntry(env, userId, currentId);
    if (!entry) continue;
    entries.push(entry);

    if (entry.isFolder) {
      const children = await env.COMMUNITY_DB.prepare('SELECT id FROM drive_files WHERE user_id = ? AND parent_id = ?')
        .bind(userId, entry.id)
        .all<Record<string, unknown>>();
      for (const child of children.results || []) {
        if (child?.id) queue.push(String(child.id));
      }
    }
  }

  return entries;
}

async function getGoogleAuthToken(env: CommunityDriveRuntimeEnv, forceRefresh = false) {
  if (!forceRefresh && env.SCHEDULE_KV?.get) {
    const cachedRaw = await env.SCHEDULE_KV.get('gdrive_token_cache');
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { token?: unknown; expiresAt?: unknown };
        if (typeof cached.token === 'string' && Number(cached.expiresAt || 0) > Date.now()) {
          return cached.token;
        }
      } catch {
        // ignore invalid cache payload
      }
    }
  }

  const clientId = String(env.GDRIVE_CLIENT_ID || '').trim();
  const clientSecret = String(env.GDRIVE_CLIENT_SECRET || '').trim();
  const refreshToken = String(env.GDRIVE_REFRESH_TOKEN || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('缺失 OAuth2 凭据 (Client ID, Secret, 或 Refresh Token)。请在 Cloudflare 后台设置环境变量。');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    if (payload.error === 'invalid_grant') {
      throw new Error('Google Refresh Token 已过期或被撤销，请重新获取 Refresh Token。');
    }
    throw new Error(`OAuth2 刷新失败: ${String(payload.error_description || payload.error || 'unknown')}`);
  }

  const token = String(payload.access_token || '');
  const expiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000 - 60_000;
  if (token && env.SCHEDULE_KV?.put) {
    await env.SCHEDULE_KV.put('gdrive_token_cache', JSON.stringify({ token, expiresAt }), {
      expirationTtl: Math.max(60, Math.floor(Number(payload.expires_in || 3600) - 60))
    });
  }
  return token;
}

function createGoogleDriveClient(env: CommunityDriveRuntimeEnv): GoogleDriveLike | null {
  const folderId = String(env.GDRIVE_FOLDER_ID || '').trim();
  if (!folderId) return null;

  return {
    async upload(input) {
      let token = await getGoogleAuthToken(env);
      const metadata = { name: input.fileName, parents: [folderId] };
      const form = new FormData();
      const fileBytes = input.bytes instanceof Uint8Array
        ? new Uint8Array(input.bytes)
        : new Uint8Array(input.bytes);
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileBytes], { type: input.contentType || 'application/octet-stream' }));

      let response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });

      if (response.status === 401) {
        token = await getGoogleAuthToken(env, true);
        response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form
        });
      }

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(String(payload?.error && typeof payload.error === 'object' ? (payload.error as Record<string, unknown>).message : payload.error || '上传失败'));
      }
      return { fileId: String(payload.id || '') };
    },
    async read(fileId) {
      let token = await getGoogleAuthToken(env);
      let response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401) {
        token = await getGoogleAuthToken(env, true);
        response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      if (!response.ok) {
        return null;
      }

      return {
        bytes: await response.arrayBuffer(),
        contentType: response.headers.get('content-type') || 'application/octet-stream'
      };
    }
  };
}

function createDriveRepository(env: CommunityDriveRuntimeEnv): DriveRepository {
  return {
    async list(input) {
      await ensureDriveSchema(env);
      let query = `SELECT id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
                   FROM drive_files WHERE user_id = ?`;
      const bindings: unknown[] = [input.userId];
      if (normalizeParentId(input.parentId)) {
        query += ' AND parent_id = ?';
        bindings.push(normalizeParentId(input.parentId));
      } else {
        query += ' AND parent_id IS NULL';
      }
      query += ' ORDER BY is_folder DESC, updated_at DESC, created_at DESC';
      const result = await env.COMMUNITY_DB.prepare(query).bind(...bindings).all<Record<string, unknown>>();
      return (result.results || []).map((row) => mapDriveEntry(row)).filter((row): row is DriveEntryRecord => Boolean(row));
    },
    async getById(input) {
      return await getDriveEntry(env, input.userId, input.id);
    },
    async getByIds(input) {
      const entries = await collectEntriesForDeletion(env, input.userId, input.ids);
      return entries;
    },
    async getStats(userId) {
      return await getStatsRecord(env, userId);
    },
    async ensureStats(userId) {
      return await ensureStatsRecord(env, userId);
    },
    async save(entry) {
      await ensureDriveSchema(env);
      await env.COMMUNITY_DB.prepare(
        `INSERT INTO drive_files (
          id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`
      )
        .bind(
          entry.id,
          entry.userId,
          entry.name,
          entry.size,
          entry.mimeType,
          entry.url,
          entry.parentId,
          entry.isFolder ? 1 : 0,
          entry.storageKey || null,
          entry.legacyFileId || null,
          entry.createdAt || null,
          entry.updatedAt || null
        )
        .run();
    },
    async rename(input) {
      const existing = await getDriveEntry(env, input.userId, input.id);
      if (!existing) return null;
      await ensureNoDuplicateName(env, input.userId, input.name, existing.parentId, input.id);
      await env.COMMUNITY_DB.prepare(
        'UPDATE drive_files SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
      )
        .bind(input.name, input.id, input.userId)
        .run();
      return await getDriveEntry(env, input.userId, input.id);
    },
    async remove(input) {
      const entries = await collectEntriesForDeletion(env, input.userId, input.ids);
      if (entries.length === 0) {
        return { deleted: [], stats: await getStatsRecord(env, input.userId) };
      }
      const deletedIds = entries.map((entry) => entry.id);
      const placeholders = deletedIds.map(() => '?').join(', ');
      await env.COMMUNITY_DB.prepare(`DELETE FROM drive_files WHERE user_id = ? AND id IN (${placeholders})`)
        .bind(input.userId, ...deletedIds)
        .run();
      const freedBytes = entries.filter((entry) => !entry.isFolder).reduce((sum, entry) => sum + Math.max(0, entry.size), 0);
      const stats = freedBytes > 0 ? await updateStatsRecord(env, input.userId, -freedBytes) : await getStatsRecord(env, input.userId);
      return { deleted: entries, stats };
    },
    async createFolder(entry) {
      await assertParentFolder(env, entry.userId, entry.parentId);
      await ensureNoDuplicateName(env, entry.userId, entry.name, entry.parentId);
      await env.COMMUNITY_DB.prepare(
        `INSERT INTO drive_files (
          id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
        ) VALUES (?, ?, ?, 0, '', '', ?, 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
        .bind(entry.id, entry.userId, entry.name, entry.parentId)
        .run();
    },
    async updateStats(userId, sizeDelta) {
      return await updateStatsRecord(env, userId, sizeDelta);
    }
  };
}

export async function buildCommunityStorageEnv(env: CommunityDriveRuntimeEnv): Promise<CommunityStorageEnv> {
  await ensureDriveSchema(env);
  return {
    publicMediaBasePath: '/api/community/media',
    r2: env.COMMUNITY_R2 || null,
    googleDrive: createGoogleDriveClient(env),
    driveRepo: createDriveRepository(env),
    maxUploadBytes: Number(env.COMMUNITY_MAX_UPLOAD_BYTES || 25 * 1024 * 1024)
  };
}

export async function findDriveEntryByMediaKey(env: CommunityDriveRuntimeEnv, fileId: string) {
  await ensureDriveSchema(env);
  const requestedId = decodeURIComponent(String(fileId || '').trim());
  if (!requestedId) return null;
  const record = await env.COMMUNITY_DB.prepare(
    `SELECT id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
     FROM drive_files
     WHERE legacy_file_id = ? OR storage_key = ? OR id = ?
     ORDER BY updated_at DESC
     LIMIT 1`
  )
    .bind(requestedId, requestedId, requestedId)
    .first<Record<string, unknown>>();
  return mapDriveEntry(record);
}

export async function getDriveInfo(context: DriveRouteContext) {
  const storage = createCommunityStorage(context.env);
  return { ok: true, stats: toLegacyStats(await storage.info(context.user.id)) };
}

export async function listDrive(context: DriveRouteContext, query: URLSearchParams) {
  const storage = createCommunityStorage(context.env);
  const parentId = query.get('parent_id');
  const files = await storage.listDrive(context.user.id, parentId);
  return { ok: true, files: files.map(toLegacyEntry) };
}

export async function createDriveFolder(context: DriveRouteContext, body: { name?: string; parent_id?: string | null }) {
  const storage = createCommunityStorage(context.env);
  const folder = await storage.mkdir(context.user.id, normalizeDriveName(String(body.name || ''), '新文件夹'), body.parent_id);
  return { ok: true, id: folder.id, folder: toLegacyEntry(folder) };
}

export async function renameDriveEntry(context: DriveRouteContext, body: { id?: string; name?: string }) {
  const storage = createCommunityStorage(context.env);
  const item = await storage.rename(context.user.id, String(body.id || '').trim(), normalizeDriveName(String(body.name || '')));
  if (!item) {
    return { ok: false, msg: '文件不存在' };
  }
  return { ok: true, item: toLegacyEntry(item) };
}

export async function deleteDriveEntries(context: DriveRouteContext, body: { ids?: string[]; id?: string }) {
  const storage = createCommunityStorage(context.env);
  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  const result = await storage.remove(context.user.id, ids);
  const freedBytes = result.deletedItems
    .filter((entry) => !entry.isFolder)
    .reduce((sum, entry) => sum + Math.max(0, entry.size), 0);
  return {
    ok: true,
    deleted: result.deleted,
    freed_bytes: freedBytes,
    deleted_items: result.deletedItems.map(toLegacyEntry),
    deletedItems: result.deletedItems.map(toLegacyEntry),
    stats: toLegacyStats(result.stats)
  };
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
  return {
    ok: true,
    id: result.id,
    file: toLegacyEntry(result.file),
    url: result.url,
    backend: result.backend,
    cacheStatus: result.cacheStatus,
    stats: result.stats ? toLegacyStats(result.stats) : undefined
  };
}
