import { getCommunityAuthUser, normalizeCommunityRole, type CommunityAuthEnv, type D1DatabaseLike } from '../../auth';
import { readCommunityMedia, uploadCommunityMedia } from './index';
import type { CommunityStorageEnv, DriveEntryRecord, DriveRepository, DriveStatsRecord, GoogleDriveLike, R2LikeBucket } from '../../../lib/storage/types';

const COMMUNITY_CACHE_META_PREFIX = 'community_cache_meta:';
const COMMUNITY_CACHE_SUMMARY_KEY = 'community_cache_summary';
const DEFAULT_COMMUNITY_R2_CACHE_MAX_BYTES = 6 * 1024 * 1024 * 1024;
const DEFAULT_COMMUNITY_R2_CACHE_MAX_ITEM_BYTES = 2 * 1024 * 1024;
const DEFAULT_COMMUNITY_R2_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_PREVIEW_TIMEOUT_MS = 8000;
const LINK_PREVIEW_MAX_BYTES = 1_500_000;

type D1QueryResult<T = Record<string, unknown>> = { results?: T[] };
type D1BatchCapable = D1DatabaseLike & { batch?: (statements: unknown[]) => Promise<unknown> };

type KvJsonOptions = { type: 'json' };
type KvListResult = { keys?: Array<{ name: string }>; cursor?: string; list_complete?: boolean };

type CommunitySidePathEnv = CommunityAuthEnv & {
  SCHEDULE_KV?: {
    get(key: string, options: KvJsonOptions): Promise<any>;
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; cursor?: string }): Promise<KvListResult>;
  };
  COMMUNITY_R2?: (R2LikeBucket & { head?(key: string): Promise<unknown | null> }) | null;
  GDRIVE_CLIENT_ID?: string;
  GDRIVE_CLIENT_SECRET?: string;
  GDRIVE_REFRESH_TOKEN?: string;
  GDRIVE_FOLDER_ID?: string;
  COMMUNITY_R2_CACHE_MAX_BYTES?: string | number;
  COMMUNITY_R2_CACHE_MAX_ITEM_BYTES?: string | number;
  COMMUNITY_R2_CACHE_MAX_AGE_MS?: string | number;
};

type CacheMeta = {
  fileId: string;
  byteSize: number;
  contentType: string;
  source: string;
  createdAt?: string;
  lastAccessAt?: string;
};

let driveSchemaPromise: Promise<void> | null = null;

function parsePositiveInt(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeDriveName(value: unknown, fallback = '未命名文件') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback;
}

function normalizeParentId(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeDriveStatsRecord(stats: Record<string, unknown> | null | undefined): DriveStatsRecord {
  const quotaBytes = Math.max(0, Number(stats?.quota_bytes ?? stats?.quotaBytes ?? 0));
  const usedBytes = Math.max(0, Number(stats?.used_bytes ?? stats?.usedBytes ?? 0));
  return {
    quotaBytes,
    usedBytes,
    availableBytes: Math.max(0, quotaBytes - usedBytes)
  };
}

async function ensureDriveSchema(env: CommunitySidePathEnv) {
  if (!driveSchemaPromise) {
    driveSchemaPromise = (async () => {
      const db = env.COMMUNITY_DB as D1BatchCapable;
      const statements = [
        db.prepare(`
          CREATE TABLE IF NOT EXISTS user_drive_stats (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            quota_bytes INTEGER DEFAULT 0,
            used_bytes INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS drive_files (
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
          )
        `),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_drive_files_user ON drive_files(user_id, parent_id)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_drive_files_parent ON drive_files(parent_id)')
      ];

      if (typeof db.batch === 'function') {
        await db.batch(statements);
      } else {
        for (const statement of statements) {
          await (statement as { run(): Promise<unknown> }).run();
        }
      }

      try {
        await env.COMMUNITY_DB.prepare('ALTER TABLE drive_files ADD COLUMN storage_key TEXT').run();
      } catch {}
      try {
        await env.COMMUNITY_DB.prepare('ALTER TABLE drive_files ADD COLUMN legacy_file_id TEXT').run();
      } catch {}
    })().catch((error) => {
      driveSchemaPromise = null;
      throw error;
    });
  }

  return driveSchemaPromise;
}

function rowToDriveEntry(row: Record<string, unknown>): DriveEntryRecord {
  return {
    id: String(row.id || ''),
    userId: String(row.user_id || row.userId || ''),
    name: normalizeDriveName(row.name, Number(row.is_folder || row.isFolder || 0) ? '未命名文件夹' : '未命名文件'),
    size: Math.max(0, Number(row.size || 0)),
    mimeType: String(row.mime_type || row.mimeType || ''),
    url: String(row.url || ''),
    parentId: normalizeParentId(row.parent_id ?? row.parentId),
    isFolder: Boolean(Number(row.is_folder || 0) || row.isFolder),
    backend: 'gdrive',
    storageKey: String(row.storage_key || row.storageKey || '').trim() || undefined,
    legacyFileId: String(row.legacy_file_id || row.legacyFileId || '').trim() || null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined
  };
}

function createDriveRepository(env: CommunitySidePathEnv): DriveRepository {
  async function ensureStatsRow(userId: string) {
    await ensureDriveSchema(env);
    await env.COMMUNITY_DB.prepare(
      'INSERT OR IGNORE INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, 0, 0)'
    )
      .bind(userId)
      .run();
  }

  return {
    async list(input) {
      await ensureDriveSchema(env);
      const result = await env.COMMUNITY_DB.prepare(`
        SELECT id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
        FROM drive_files
        WHERE user_id = ? AND ${input.parentId == null ? 'parent_id IS NULL' : 'parent_id = ?'}
        ORDER BY is_folder DESC, datetime(updated_at) DESC, datetime(created_at) DESC
      `)
        .bind(input.userId, ...(input.parentId == null ? [] : [input.parentId]))
        .all<Record<string, unknown>>();
      return (result.results || []).map(rowToDriveEntry);
    },
    async getById(input) {
      await ensureDriveSchema(env);
      const row = await env.COMMUNITY_DB.prepare(`
        SELECT id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
        FROM drive_files
        WHERE user_id = ? AND id = ?
        LIMIT 1
      `)
        .bind(input.userId, input.id)
        .first<Record<string, unknown>>();
      return row ? rowToDriveEntry(row) : null;
    },
    async getByIds(input) {
      await ensureDriveSchema(env);
      const ids = Array.from(new Set(input.ids.map((value) => String(value || '').trim()).filter(Boolean)));
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      const result = await env.COMMUNITY_DB.prepare(`
        SELECT id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
        FROM drive_files
        WHERE user_id = ? AND id IN (${placeholders})
      `)
        .bind(input.userId, ...ids)
        .all<Record<string, unknown>>();
      return (result.results || []).map(rowToDriveEntry);
    },
    async getStats(userId) {
      await ensureStatsRow(userId);
      const row = await env.COMMUNITY_DB.prepare('SELECT quota_bytes, used_bytes FROM user_drive_stats WHERE user_id = ?')
        .bind(userId)
        .first<Record<string, unknown>>();
      return normalizeDriveStatsRecord(row);
    },
    async ensureStats(userId) {
      return this.getStats(userId);
    },
    async save(entry) {
      await ensureDriveSchema(env);
      await env.COMMUNITY_DB.prepare(`
        INSERT OR REPLACE INTO drive_files (
          id, user_id, name, size, mime_type, url, parent_id, is_folder, storage_key, legacy_file_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
      `)
        .bind(
          entry.id,
          entry.userId,
          normalizeDriveName(entry.name),
          Math.max(0, Number(entry.size || 0)),
          entry.mimeType || '',
          entry.url || '',
          normalizeParentId(entry.parentId),
          entry.isFolder ? 1 : 0,
          entry.storageKey || null,
          entry.legacyFileId || null,
          entry.createdAt || null,
          entry.updatedAt || null
        )
        .run();
    },
    async rename(input) {
      await ensureDriveSchema(env);
      await env.COMMUNITY_DB.prepare(`
        UPDATE drive_files
        SET name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id = ?
      `)
        .bind(normalizeDriveName(input.name), input.userId, input.id)
        .run();
      return await this.getById({ userId: input.userId, id: input.id });
    },
    async remove(input) {
      await ensureDriveSchema(env);
      const deleted = await this.getByIds(input);
      if (deleted.length === 0) {
        return { deleted: [], stats: await this.getStats(input.userId) };
      }
      const placeholders = deleted.map(() => '?').join(', ');
      await env.COMMUNITY_DB.prepare(`DELETE FROM drive_files WHERE user_id = ? AND id IN (${placeholders})`)
        .bind(input.userId, ...deleted.map((entry) => entry.id))
        .run();
      const sizeDelta = -deleted.reduce((sum, entry) => sum + (entry.isFolder ? 0 : Number(entry.size || 0)), 0);
      const stats = await this.updateStats(input.userId, sizeDelta);
      return { deleted, stats };
    },
    async createFolder(entry) {
      await this.save(entry);
    },
    async updateStats(userId, sizeDelta) {
      await ensureStatsRow(userId);
      await env.COMMUNITY_DB.prepare(`
        UPDATE user_drive_stats
        SET used_bytes = MAX(0, COALESCE(used_bytes, 0) + ?), updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `)
        .bind(Math.trunc(Number(sizeDelta || 0)), userId)
        .run();
      return await this.getStats(userId);
    }
  };
}

async function getGoogleAuthToken(env: CommunitySidePathEnv, forceRefresh = false) {
  if (!env.SCHEDULE_KV) {
    throw new Error('SCHEDULE_KV 未配置');
  }

  if (!forceRefresh) {
    const cached = await env.SCHEDULE_KV.get('gdrive_token_cache', { type: 'json' });
    if (cached && Date.now() < Number(cached.expiresAt || 0)) {
      return String(cached.token || '');
    }
  }

  if (!env.GDRIVE_CLIENT_ID || !env.GDRIVE_CLIENT_SECRET || !env.GDRIVE_REFRESH_TOKEN) {
    throw new Error('缺失 OAuth2 凭据 (Client ID, Secret, 或 Refresh Token)。请在 Cloudflare 后台设置环境变量。');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GDRIVE_CLIENT_ID,
      client_secret: env.GDRIVE_CLIENT_SECRET,
      refresh_token: env.GDRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

  const data = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) {
    if (data.error === 'invalid_grant') {
      throw new Error('Google Refresh Token 已过期或被撤销，请重新获取 Refresh Token。');
    }
    throw new Error(`OAuth2 刷新失败: ${String(data.error_description || data.error || 'unknown')}`);
  }

  const accessToken = String(data.access_token || '');
  const expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000 - 60000;
  await env.SCHEDULE_KV.put(
    'gdrive_token_cache',
    JSON.stringify({ token: accessToken, expiresAt }),
    { expirationTtl: Math.max(60, Math.floor(Number(data.expires_in || 3600) - 60)) }
  );
  return accessToken;
}

function createGoogleDrive(env: CommunitySidePathEnv): GoogleDriveLike | null {
  if (!env.GDRIVE_FOLDER_ID || !env.SCHEDULE_KV) {
    return null;
  }

  return {
    async upload(input) {
      let token = await getGoogleAuthToken(env);
      const metadata = { name: input.fileName, parents: [env.GDRIVE_FOLDER_ID] };
      const form = new FormData();
      const fileBytes = new Uint8Array(input.bytes instanceof Uint8Array ? input.bytes : input.bytes.slice(0));
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileBytes], { type: input.contentType }));

      let resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });

      if (resp.status === 401) {
        token = await getGoogleAuthToken(env, true);
        resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form
        });
      }

      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok) {
        throw new Error(String((data.error as Record<string, unknown> | undefined)?.message || '上传失败'));
      }
      return { fileId: String(data.id || '') };
    },
    async read(fileId) {
      let token = await getGoogleAuthToken(env);
      let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.status === 401) {
        token = await getGoogleAuthToken(env, true);
        resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      if (!resp.ok) return null;
      return {
        bytes: await resp.arrayBuffer(),
        contentType: String(resp.headers.get('content-type') || 'application/octet-stream')
      };
    }
  };
}

function getCommunityCacheConfig(env: CommunitySidePathEnv) {
  return {
    maxBytes: parsePositiveInt(env.COMMUNITY_R2_CACHE_MAX_BYTES, DEFAULT_COMMUNITY_R2_CACHE_MAX_BYTES),
    maxItemBytes: parsePositiveInt(env.COMMUNITY_R2_CACHE_MAX_ITEM_BYTES, DEFAULT_COMMUNITY_R2_CACHE_MAX_ITEM_BYTES),
    maxAgeMs: parsePositiveInt(env.COMMUNITY_R2_CACHE_MAX_AGE_MS, DEFAULT_COMMUNITY_R2_CACHE_MAX_AGE_MS)
  };
}

function canCacheCommunityMedia(contentType: string, byteSize: number, env: CommunitySidePathEnv) {
  if (!env.COMMUNITY_R2) return false;
  const normalizedType = String(contentType || '').toLowerCase();
  if (!normalizedType.startsWith('image/')) return false;
  if (normalizedType.includes('gif')) return false;
  const config = getCommunityCacheConfig(env);
  return Number(byteSize || 0) > 0 && Number(byteSize || 0) <= config.maxItemBytes;
}

async function getCommunityCacheSummary(env: CommunitySidePathEnv) {
  const raw = await env.SCHEDULE_KV?.get(COMMUNITY_CACHE_SUMMARY_KEY, { type: 'json' });
  return raw || { totalBytes: 0, itemCount: 0, updatedAt: null };
}

async function setCommunityCacheSummary(env: CommunitySidePathEnv, summary: Record<string, unknown>) {
  await env.SCHEDULE_KV?.put(
    COMMUNITY_CACHE_SUMMARY_KEY,
    JSON.stringify({
      totalBytes: Math.max(0, Number(summary.totalBytes || 0)),
      itemCount: Math.max(0, Number(summary.itemCount || 0)),
      updatedAt: new Date().toISOString()
    })
  );
}

async function getCommunityCacheMeta(env: CommunitySidePathEnv, fileId: string): Promise<CacheMeta | null> {
  return (await env.SCHEDULE_KV?.get(`${COMMUNITY_CACHE_META_PREFIX}${fileId}`, { type: 'json' })) || null;
}

async function setCommunityCacheMeta(env: CommunitySidePathEnv, fileId: string, meta: CacheMeta) {
  await env.SCHEDULE_KV?.put(
    `${COMMUNITY_CACHE_META_PREFIX}${fileId}`,
    JSON.stringify({
      fileId,
      byteSize: Math.max(0, Number(meta.byteSize || 0)),
      contentType: String(meta.contentType || 'image/jpeg'),
      source: String(meta.source || 'drive'),
      createdAt: meta.createdAt || new Date().toISOString(),
      lastAccessAt: meta.lastAccessAt || new Date().toISOString()
    })
  );
}

async function deleteCommunityCacheEntry(env: CommunitySidePathEnv, fileId: string, meta: CacheMeta | null = null, skipSummaryUpdate = false) {
  if (!env.COMMUNITY_R2) return;
  const existingMeta = meta || (!skipSummaryUpdate ? await getCommunityCacheMeta(env, fileId) : null);
  await Promise.all([
    env.COMMUNITY_R2.delete(fileId),
    env.SCHEDULE_KV?.delete(`${COMMUNITY_CACHE_META_PREFIX}${fileId}`)
  ]);
  if (!skipSummaryUpdate) {
    const summary = await getCommunityCacheSummary(env);
    await setCommunityCacheSummary(env, {
      totalBytes: Math.max(0, Number(summary.totalBytes || 0) - Number(existingMeta?.byteSize || 0)),
      itemCount: Math.max(0, Number(summary.itemCount || 0) - (existingMeta ? 1 : 0))
    });
  }
}

async function listCommunityCacheMetas(env: CommunitySidePathEnv) {
  const entries: CacheMeta[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SCHEDULE_KV?.list({ prefix: COMMUNITY_CACHE_META_PREFIX, cursor });
    cursor = page?.list_complete ? undefined : page?.cursor;
    const keys = page?.keys || [];
    if (keys.length > 0) {
      const results = await Promise.all(keys.map((key) => env.SCHEDULE_KV?.get(key.name, { type: 'json' })));
      for (const value of results) {
        if (value && value.fileId) entries.push(value as CacheMeta);
      }
    }
  } while (cursor);
  return entries;
}

async function pruneCommunityCache(env: CommunitySidePathEnv, bytesNeeded = 0) {
  if (!env.COMMUNITY_R2) return;
  const config = getCommunityCacheConfig(env);
  const now = Date.now();
  const allEntries = await listCommunityCacheMetas(env);
  const entriesToDelete: CacheMeta[] = [];
  const entriesToKeep: CacheMeta[] = [];

  for (const entry of allEntries) {
    const lastAccessAt = Date.parse(entry.lastAccessAt || entry.createdAt || '');
    if (lastAccessAt && now - lastAccessAt > config.maxAgeMs) {
      entriesToDelete.push(entry);
    } else {
      entriesToKeep.push(entry);
    }
  }

  entriesToKeep.sort((a, b) => {
    const aTime = Date.parse(a.lastAccessAt || a.createdAt || '') || 0;
    const bTime = Date.parse(b.lastAccessAt || b.createdAt || '') || 0;
    return aTime - bTime;
  });

  let totalBytes = entriesToKeep.reduce((sum, entry) => sum + Number(entry.byteSize || 0), 0);
  while (entriesToKeep.length && totalBytes + bytesNeeded > config.maxBytes) {
    const victim = entriesToKeep.shift();
    if (!victim) break;
    totalBytes -= Number(victim.byteSize || 0);
    entriesToDelete.push(victim);
  }

  for (const entry of entriesToDelete) {
    await deleteCommunityCacheEntry(env, entry.fileId, entry, true);
  }

  await setCommunityCacheSummary(env, { totalBytes, itemCount: entriesToKeep.length });
}

async function touchCommunityCacheEntry(env: CommunitySidePathEnv, fileId: string) {
  const meta = await getCommunityCacheMeta(env, fileId);
  if (!meta) return;
  await setCommunityCacheMeta(env, fileId, { ...meta, lastAccessAt: new Date().toISOString() });
}

async function cacheCommunityMedia(env: CommunitySidePathEnv, fileId: string, buffer: ArrayBuffer, contentType: string, source = 'drive') {
  if (!env.COMMUNITY_R2 || !canCacheCommunityMedia(contentType, buffer.byteLength, env)) return false;
  const existingMeta = await getCommunityCacheMeta(env, fileId);
  const previousBytes = Number(existingMeta?.byteSize || 0);
  await pruneCommunityCache(env, Math.max(0, buffer.byteLength - previousBytes));
  await env.COMMUNITY_R2.put(fileId, buffer, { httpMetadata: { contentType } });
  await setCommunityCacheMeta(env, fileId, {
    fileId,
    byteSize: buffer.byteLength,
    contentType,
    source,
    createdAt: existingMeta?.createdAt || new Date().toISOString(),
    lastAccessAt: new Date().toISOString()
  });
  const summary = await getCommunityCacheSummary(env);
  await setCommunityCacheSummary(env, {
    totalBytes: Math.max(0, Number(summary.totalBytes || 0) - previousBytes + buffer.byteLength),
    itemCount: Math.max(0, Number(summary.itemCount || 0) + (existingMeta ? 0 : 1))
  });
  return true;
}

function extractCommunityMediaFileId(mediaUrl: unknown) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://local.invalid');
    const match = parsed.pathname.match(/\/api\/community\/media\/([^/?#]+)/);
    return match ? safeDecodeURIComponent(match[1]) : '';
  } catch {
    const match = raw.match(/\/api\/community\/media\/([^/?#]+)/);
    return match ? safeDecodeURIComponent(match[1]) : '';
  }
}

async function readDriveFileFromRemote(env: CommunitySidePathEnv, fileId: string) {
  const drive = createGoogleDrive(env);
  return drive ? await drive.read(fileId) : null;
}

async function preheatCommunityMediaFile(env: CommunitySidePathEnv, fileId: string) {
  if (!fileId) return { status: 'invalid' as const };
  if (!env.COMMUNITY_R2) return { status: 'disabled' as const };
  try {
    const existing = await env.COMMUNITY_R2.head?.(fileId);
    if (existing) {
      await touchCommunityCacheEntry(env, fileId);
      return { status: 'hit' as const };
    }
  } catch {}

  const remote = await readDriveFileFromRemote(env, fileId);
  if (!remote) return { status: 'missing' as const };
  if (!canCacheCommunityMedia(remote.contentType, remote.bytes.byteLength, env)) {
    return { status: 'skipped' as const, reason: 'not_cacheable', byteSize: remote.bytes.byteLength, contentType: remote.contentType };
  }
  await cacheCommunityMedia(env, fileId, remote.bytes, remote.contentType, 'admin-preheat');
  return { status: 'cached' as const, byteSize: remote.bytes.byteLength, contentType: remote.contentType };
}

async function collectRecentCommunityMediaFileIds(env: CommunitySidePathEnv, limit = 24) {
  const maxItems = Math.max(1, Math.min(80, Number(limit || 24)));
  const postRows = await env.COMMUNITY_DB.prepare('SELECT media_json FROM posts ORDER BY created_at DESC LIMIT ?')
    .bind(Math.max(maxItems * 2, 40))
    .all<Record<string, unknown>>();
  const userRows = await env.COMMUNITY_DB.prepare('SELECT avatar_url, background_url FROM users ORDER BY created_at DESC LIMIT ?')
    .bind(Math.max(Math.ceil(maxItems / 2), 20))
    .all<Record<string, unknown>>();

  const ids: string[] = [];
  const seen = new Set<string>();
  const pushUrl = (value: unknown) => {
    const fileId = extractCommunityMediaFileId(value);
    if (!fileId || seen.has(fileId)) return;
    seen.add(fileId);
    ids.push(fileId);
  };

  for (const row of postRows.results || []) {
    try {
      const items = JSON.parse(String(row.media_json || '[]')) as Array<Record<string, unknown>>;
      for (const item of Array.isArray(items) ? items : []) {
        pushUrl(item?.url);
        if (ids.length >= maxItems) return ids;
      }
    } catch {}
  }

  for (const row of userRows.results || []) {
    pushUrl(row.avatar_url);
    if (ids.length >= maxItems) return ids;
    pushUrl(row.background_url);
    if (ids.length >= maxItems) return ids;
  }

  return ids.slice(0, maxItems);
}

function createPreviewTooLargeError() {
  const error = new Error('LINK_PREVIEW_TOO_LARGE') as Error & { code?: string };
  error.code = 'LINK_PREVIEW_TOO_LARGE';
  return error;
}

function isPreviewTooLargeError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === 'LINK_PREVIEW_TOO_LARGE' || String(value?.message || '') === 'LINK_PREVIEW_TOO_LARGE';
}

function createTimeoutError(message = 'Operation timed out') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message = 'Operation timed out') {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(createTimeoutError(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fetchWithTimeout(resource: string, init: RequestInit = {}, timeoutMs = LINK_PREVIEW_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseTextWithLimit(resp: Response, maxBytes = LINK_PREVIEW_MAX_BYTES, timeoutMs = LINK_PREVIEW_TIMEOUT_MS) {
  if (!resp.body?.getReader) {
    const text = await withTimeout(resp.text(), timeoutMs, 'Preview body timeout');
    if (new TextEncoder().encode(text).length > maxBytes) throw createPreviewTooLargeError();
    return text;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await withTimeout(reader.read(), timeoutMs, 'Preview body timeout');
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) throw createPreviewTooLargeError();
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

function extractMetaTag(html: string, key: string, attr = 'property') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverseRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escaped}["'][^>]*>`, 'i');
  const match = html.match(regex) || html.match(reverseRegex);
  return match ? match[1].trim() : '';
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function cleanPreviewTitle(title: string, host: string) {
  const raw = String(title || '').trim();
  if (!raw) return '';
  if (host.includes('bilibili.com') || host === 'b23.tv') return raw.replace(/[-_ ]*哔哩哔哩.*$/i, '').replace(/[-_ ]*bilibili.*$/i, '').trim();
  if (host.includes('xiaohongshu.com')) return raw.replace(/[-_ ]*小红书.*$/i, '').trim();
  if (host.includes('douyin.com')) return raw.replace(/[-_ ]*抖音.*$/i, '').trim();
  if (host.includes('weibo.com')) return raw.replace(/[-_ ]*微博.*$/i, '').trim();
  if (host.includes('youtube.com') || host === 'youtu.be') return raw.replace(/[-_ ]*youtube.*$/i, '').trim();
  return raw;
}

function buildFallbackPreview(targetUrl: string, reason = '') {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(Boolean).map((part) => safeDecodeURIComponent(part));
    let title = '';

    if (host.includes('bilibili.com') || host === 'b23.tv') {
      const bv = pathParts.find((part) => /^BV/i.test(part));
      title = bv ? `Bilibili 视频 ${bv}` : 'Bilibili 链接';
    } else if (host.includes('xiaohongshu.com')) {
      title = '小红书链接';
    } else if (host.includes('douyin.com')) {
      title = '抖音链接';
    } else if (host.includes('weibo.com')) {
      title = '微博链接';
    } else if (pathParts.length) {
      title = pathParts[pathParts.length - 1].replace(/\.[a-z0-9]+$/i, '').trim();
    }

    if (!title) title = host || '链接预览';
    return {
      url: parsed.toString(),
      title: title.slice(0, 120),
      image: '',
      description: reason ? `暂未获取站点摘要：${reason}` : '',
      host
    };
  } catch {
    return {
      url: String(targetUrl || ''),
      title: '链接预览',
      image: '',
      description: reason ? `暂未获取站点摘要：${reason}` : '',
      host: ''
    };
  }
}

function getPreviewFetchHeaders(extra: Record<string, string> = {}) {
  return {
    'user-agent': 'Mozilla/5.0 (compatible; 8communityBot/1.0; +https://thefallback.cc.cd)',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...extra
  };
}

function extractBilibiliBvid(value: string) {
  const match = String(value || '').match(/BV[0-9A-Za-z]{10}/i);
  return match ? match[0].toUpperCase() : '';
}

function getBilibiliCanonicalUrl(bvid: string) {
  return `https://www.bilibili.com/video/${encodeURIComponent(bvid)}`;
}

function isYouTubeHost(hostname: string) {
  const host = String(hostname || '').toLowerCase();
  return host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com';
}

function normalizeBilibiliImageUrl(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;
  return raw;
}

function extractYouTubeVideoId(targetUrl: string) {
  try {
    const url = new URL(targetUrl);
    if (url.hostname === 'youtu.be') return url.pathname.replace(/^\/+/, '').split('/')[0];
    if (url.pathname === '/watch') return url.searchParams.get('v') || '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') return parts[1] || '';
  } catch {}
  return '';
}

function getYouTubeCanonicalUrl(videoId: string, fallbackUrl = '') {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : String(fallbackUrl || '');
}

function normalizeYouTubeImageUrl(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

async function fetchBilibiliPreview(targetUrl: string) {
  const target = new URL(targetUrl);
  let bvid = extractBilibiliBvid(target.toString());
  if (!bvid && target.hostname === 'b23.tv') {
    try {
      const redirectResp = await fetchWithTimeout(target.toString(), {
        redirect: 'manual',
        headers: getPreviewFetchHeaders()
      });
      const location = redirectResp.headers.get('location') || '';
      if (location) {
        bvid = extractBilibiliBvid(new URL(location, target.toString()).toString());
      }
    } catch {}
  }
  if (!bvid) return null;

  const apiResp = await fetchWithTimeout(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
    headers: getPreviewFetchHeaders({ accept: 'application/json' })
  });
  if (!apiResp.ok) return null;
  const payload = (await apiResp.json()) as Record<string, any>;
  if (payload?.code !== 0 || !payload?.data?.title) {
    return {
      url: getBilibiliCanonicalUrl(bvid),
      title: `Bilibili 视频 ${bvid}`,
      image: '',
      description: 'Bilibili 视频链接',
      host: 'bilibili.com'
    };
  }

  const data = payload.data;
  const description = String(data.desc || '').trim();
  const ownerName = String(data.owner?.name || '').trim();
  return {
    url: getBilibiliCanonicalUrl(bvid),
    title: cleanPreviewTitle(String(data.title || ''), 'bilibili.com'),
    image: normalizeBilibiliImageUrl(String(data.pic || '')),
    description: description && description !== '-' ? description : (ownerName ? `UP主：${ownerName}` : ''),
    host: 'bilibili.com'
  };
}

async function fetchYouTubePreview(targetUrl: string) {
  const canonicalUrl = getYouTubeCanonicalUrl(extractYouTubeVideoId(targetUrl), targetUrl);
  const resp = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`, {
    headers: getPreviewFetchHeaders({ accept: 'application/json' })
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Record<string, unknown>;
  if (!data?.title) return null;
  return {
    url: canonicalUrl,
    title: cleanPreviewTitle(String(data.title || ''), 'youtube.com'),
    image: normalizeYouTubeImageUrl(String(data.thumbnail_url || '')),
    description: data.author_name ? `频道：${String(data.author_name).trim()}` : '',
    host: 'youtube.com'
  };
}

function isAbortLikeError(error: unknown) {
  const value = error as { name?: string; message?: string } | null;
  return String(value?.name || '') === 'AbortError' || /aborted|timeout/i.test(String(value?.message || ''));
}

function isPrivatePreviewHost(hostname: string) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home') || host.endsWith('.lan')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  return false;
}

function absolutizePreviewUrl(value: string, baseUrl: string) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function createStorageEnv(env: CommunitySidePathEnv): CommunityStorageEnv {
  return {
    publicMediaBasePath: '/api/community/media',
    r2: env.COMMUNITY_R2 || null,
    googleDrive: createGoogleDrive(env),
    driveRepo: createDriveRepository(env)
  };
}

export async function handleCommunityUpload(env: CommunitySidePathEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user) {
    return { status: 401, body: { ok: false, msg: '请先登录' } };
  }

  const buffer = await request.arrayBuffer();
  const contentType = request.headers.get('content-type') || 'image/jpeg';
  try {
    const result = await uploadCommunityMedia(createStorageEnv(env), user.id, {
      fileName: `img_${Date.now()}`,
      contentType,
      size: buffer.byteLength,
      bytes: buffer
    });

    return {
      status: 200,
      body: {
        ok: true,
        fileId: result.fileId,
        url: result.url,
        fromDrive: true,
        cachedToR2: canCacheCommunityMedia(contentType, buffer.byteLength, env)
      }
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 500, body: { ok: false, msg: `Drive 发布失败: ${msg}` } };
  }
}

export async function handleCommunityMediaRead(env: CommunitySidePathEnv, fileId: string) {
  const result = await readCommunityMedia(createStorageEnv(env), fileId, {
    storageKey: fileId,
    legacyFileId: fileId
  });

  if (!result.ok || !result.bytes) {
    return new Response('Media Not Found', { status: 404 });
  }

  if (result.backend === 'r2-cache') {
    await touchCommunityCacheEntry(env, fileId).catch(() => undefined);
  } else if (result.backend === 'gdrive' && canCacheCommunityMedia(String(result.contentType || ''), result.bytes.byteLength, env)) {
    await cacheCommunityMedia(env, fileId, result.bytes, String(result.contentType || 'application/octet-stream'), 'drive-backfill').catch(() => undefined);
  }

  return new Response(result.bytes, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': String(result.contentType || 'application/octet-stream'),
      'X-Cache': String(result.cacheStatus || ''),
      'Cache-Control': 'public, max-age=31536000'
    }
  });
}

export async function handleCommunityMediaCacheStats(env: CommunitySidePathEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user || normalizeCommunityRole(user.role) === 'user') {
    return { status: 403, body: { ok: false } };
  }

  const summary = await getCommunityCacheSummary(env);
  const config = getCommunityCacheConfig(env);
  return {
    status: 200,
    body: {
      ok: true,
      summary,
      config,
      usagePercent: config.maxBytes ? Number(((Number(summary.totalBytes || 0) / config.maxBytes) * 100).toFixed(2)) : 0
    }
  };
}

export async function handleCommunityMediaCacheWarm(env: CommunitySidePathEnv, request: Request) {
  const user = await getCommunityAuthUser(env, request);
  if (!user || normalizeCommunityRole(user.role) === 'user') {
    return { status: 403, body: { ok: false } };
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const limit = Math.max(1, Math.min(80, Number(body.limit || 24)));
  const fileIds = await collectRecentCommunityMediaFileIds(env, limit);
  const stats = { requested: limit, selected: fileIds.length, hit: 0, cached: 0, skipped: 0, missing: 0, failed: 0 };

  await Promise.all(
    fileIds.map(async (fileId) => {
      try {
        const result = await preheatCommunityMediaFile(env, fileId);
        if (result.status === 'hit') stats.hit += 1;
        else if (result.status === 'cached') stats.cached += 1;
        else if (result.status === 'skipped') stats.skipped += 1;
        else if (result.status === 'missing') stats.missing += 1;
        else stats.failed += 1;
      } catch {
        stats.failed += 1;
      }
    })
  );

  const summary = await getCommunityCacheSummary(env);
  const config = getCommunityCacheConfig(env);
  return {
    status: 200,
    body: {
      ok: true,
      stats,
      summary,
      config,
      usagePercent: config.maxBytes ? Number(((Number(summary.totalBytes || 0) / config.maxBytes) * 100).toFixed(2)) : 0
    }
  };
}

export async function handleCommunityTestDrive(env: CommunitySidePathEnv) {
  try {
    const token = await getGoogleAuthToken(env);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(env.GDRIVE_FOLDER_ID || ''))}?supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const drive = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String((drive.error as Record<string, unknown> | undefined)?.message || '诊断失败'));
    }
    return { status: 200, body: { ok: true, msg: '[V4-OAuth2] 诊断完成', folder: String(drive.name || '') } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 200, body: { ok: false, err: msg } };
  }
}

export async function handleCommunityLinkPreview(request: Request) {
  const url = new URL(request.url);
  const rawUrl = url.searchParams.get('url') || '';
  if (!rawUrl) {
    return { status: 400, body: { ok: false, msg: '缺少链接' } };
  }

  try {
    const target = new URL(rawUrl);
    if (!['http:', 'https:'].includes(target.protocol)) {
      return { status: 400, body: { ok: false, msg: '链接协议不支持' } };
    }
    if (isPrivatePreviewHost(target.hostname)) {
      return { status: 400, body: { ok: false, msg: '该链接不允许预览' } };
    }

    if (isYouTubeHost(target.hostname)) {
      const youtubePreview = await fetchYouTubePreview(target.toString());
      if (youtubePreview) {
        return { status: 200, body: { ok: true, preview: youtubePreview } };
      }
    }

    if (/(^|\.)bilibili\.com$/i.test(target.hostname) || target.hostname === 'b23.tv') {
      const bilibiliPreview = await fetchBilibiliPreview(target.toString());
      if (bilibiliPreview) {
        return { status: 200, body: { ok: true, preview: bilibiliPreview } };
      }
    }

    let fallbackPreview = buildFallbackPreview(target.toString());
    const resp = await fetchWithTimeout(target.toString(), {
      redirect: 'follow',
      headers: getPreviewFetchHeaders()
    });
    if (!resp.ok) {
      return { status: 200, body: { ok: true, preview: buildFallbackPreview(target.toString(), '站点拒绝返回预览内容') } };
    }

    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(resp.headers.get('content-length') || 0);
    if (contentLength && contentLength > LINK_PREVIEW_MAX_BYTES) {
      return { status: 200, body: { ok: true, preview: buildFallbackPreview(target.toString(), '链接内容过大，已改为基础卡片') } };
    }
    if (contentType && !/(text\/html|application\/xhtml\+xml)/.test(contentType)) {
      return { status: 200, body: { ok: true, preview: buildFallbackPreview(target.toString(), '该链接类型不支持抓取网页信息') } };
    }

    const finalUrl = resp.url || target.toString();
    const final = new URL(finalUrl);
    if (isPrivatePreviewHost(final.hostname)) {
      return { status: 400, body: { ok: false, msg: '该链接不允许预览' } };
    }

    fallbackPreview = buildFallbackPreview(finalUrl);
    const html = await readResponseTextWithLimit(resp, LINK_PREVIEW_MAX_BYTES, LINK_PREVIEW_TIMEOUT_MS);
    const title = cleanPreviewTitle(
      extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title', 'name') || extractTitle(html),
      final.hostname
    );
    const image = absolutizePreviewUrl(
      extractMetaTag(html, 'og:image') || extractMetaTag(html, 'twitter:image', 'name'),
      finalUrl
    );
    const description =
      extractMetaTag(html, 'og:description') ||
      extractMetaTag(html, 'description', 'name') ||
      extractMetaTag(html, 'twitter:description', 'name');

    return {
      status: 200,
      body: {
        ok: true,
        preview: {
          url: finalUrl,
          title: title || fallbackPreview.title,
          image,
          description: String(description || '').trim() || fallbackPreview.description,
          host: final.hostname.replace(/^www\./, '')
        }
      }
    };
  } catch (error) {
    if (isAbortLikeError(error) || isPreviewTooLargeError(error)) {
      return {
        status: 200,
        body: {
          ok: true,
          preview: buildFallbackPreview(rawUrl, isPreviewTooLargeError(error) ? '链接内容过大，已改为基础卡片' : '链接解析超时，已改为基础卡片')
        }
      };
    }
    return { status: 200, body: { ok: true, preview: buildFallbackPreview(rawUrl, '暂时无法抓取站点信息') } };
  }
}
