import htmlContent from './index.html';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'admin888';
const DEFAULT_COMMUNITY_OWNER_USERS = 'admin';
const COMMUNITY_LEVEL_THRESHOLDS = [0, 10, 25, 45, 70, 100, 140, 190, 250, 325, 415, 520, 640, 780, 940, 1120, 1325, 1555, 1810, 2090];
const COMMUNITY_CACHE_META_PREFIX = 'community_cache_meta:';
const COMMUNITY_CACHE_SUMMARY_KEY = 'community_cache_summary';
const DEFAULT_COMMUNITY_R2_CACHE_MAX_BYTES = 6 * 1024 * 1024 * 1024;
const DEFAULT_COMMUNITY_R2_CACHE_MAX_ITEM_BYTES = 2 * 1024 * 1024;
const DEFAULT_COMMUNITY_R2_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function parseIdentityList(value) {
  return new Set(String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean));
}

function isCommunityAdminRole(role) {
  return role === 'admin' || role === 'owner';
}

function isCommunityOwnerRole(role) {
  return role === 'owner';
}

function normalizeCommunityRole(user, env) {
  const baseRole = String(user?.role || 'user').trim().toLowerCase();
  if (baseRole === 'owner') return 'owner';
  if (baseRole !== 'admin') return 'user';
  const ownerUsers = parseIdentityList(env.COMMUNITY_OWNER_USERS || DEFAULT_COMMUNITY_OWNER_USERS);
  const ownerIds = parseIdentityList(env.COMMUNITY_OWNER_IDS || '');
  const username = String(user?.username || '').trim().toLowerCase();
  const id = String(user?.id || '').trim().toLowerCase();
  return (ownerUsers.has(username) || ownerIds.has(id)) ? 'owner' : 'admin';
}

function withCommunityRole(user, env) {
  if (!user) return null;
  const role = normalizeCommunityRole(user, env);
  return role === user.role ? user : { ...user, role };
}

function getCommunityLevelFromXp(xpValue) {
  const xp = Math.max(0, Number(xpValue || 0));
  for (let i = COMMUNITY_LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (xp >= COMMUNITY_LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function withCommunityLevel(entity) {
  if (!entity || typeof entity !== 'object') return entity;
  const xp = Math.max(0, Number(entity.xp || 0));
  const level = getCommunityLevelFromXp(xp);
  if (entity.xp === xp && entity.level === level) return entity;
  return { ...entity, xp, level };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getCommunityCacheConfig(env) {
  return {
    maxBytes: parsePositiveInt(env.COMMUNITY_R2_CACHE_MAX_BYTES, DEFAULT_COMMUNITY_R2_CACHE_MAX_BYTES),
    maxItemBytes: parsePositiveInt(env.COMMUNITY_R2_CACHE_MAX_ITEM_BYTES, DEFAULT_COMMUNITY_R2_CACHE_MAX_ITEM_BYTES),
    maxAgeMs: parsePositiveInt(env.COMMUNITY_R2_CACHE_MAX_AGE_MS, DEFAULT_COMMUNITY_R2_CACHE_MAX_AGE_MS),
  };
}

function canCacheCommunityMedia(contentType, byteSize, env) {
  if (!env.COMMUNITY_R2) return false;
  const normalizedType = String(contentType || '').toLowerCase();
  if (!normalizedType.startsWith('image/')) return false;
  if (normalizedType.includes('gif')) return false;
  const config = getCommunityCacheConfig(env);
  return Number(byteSize || 0) > 0 && Number(byteSize || 0) <= config.maxItemBytes;
}

async function getCommunityCacheSummary(env) {
  return (await env.SCHEDULE_KV.get(COMMUNITY_CACHE_SUMMARY_KEY, { type: 'json' })) || {
    totalBytes: 0,
    itemCount: 0,
    updatedAt: null,
  };
}

async function setCommunityCacheSummary(env, summary) {
  await env.SCHEDULE_KV.put(COMMUNITY_CACHE_SUMMARY_KEY, JSON.stringify({
    totalBytes: Math.max(0, Number(summary?.totalBytes || 0)),
    itemCount: Math.max(0, Number(summary?.itemCount || 0)),
    updatedAt: new Date().toISOString(),
  }));
}

async function getCommunityCacheMeta(env, fileId) {
  return await env.SCHEDULE_KV.get(`${COMMUNITY_CACHE_META_PREFIX}${fileId}`, { type: 'json' });
}

async function setCommunityCacheMeta(env, fileId, meta) {
  await env.SCHEDULE_KV.put(`${COMMUNITY_CACHE_META_PREFIX}${fileId}`, JSON.stringify({
    fileId,
    byteSize: Math.max(0, Number(meta?.byteSize || 0)),
    contentType: String(meta?.contentType || 'image/jpeg'),
    source: String(meta?.source || 'drive'),
    createdAt: meta?.createdAt || new Date().toISOString(),
    lastAccessAt: meta?.lastAccessAt || new Date().toISOString(),
  }));
}

async function deleteCommunityCacheEntry(env, fileId, meta = null) {
  if (!env.COMMUNITY_R2) return;
  const existingMeta = meta || await getCommunityCacheMeta(env, fileId);
  await env.COMMUNITY_R2.delete(fileId);
  await env.SCHEDULE_KV.delete(`${COMMUNITY_CACHE_META_PREFIX}${fileId}`);
  const summary = await getCommunityCacheSummary(env);
  await setCommunityCacheSummary(env, {
    totalBytes: Math.max(0, Number(summary.totalBytes || 0) - Number(existingMeta?.byteSize || 0)),
    itemCount: Math.max(0, Number(summary.itemCount || 0) - (existingMeta ? 1 : 0)),
  });
}

async function listCommunityCacheMetas(env) {
  const entries = [];
  let cursor = undefined;
  do {
    const page = await env.SCHEDULE_KV.list({ prefix: COMMUNITY_CACHE_META_PREFIX, cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    for (const key of page.keys || []) {
      const value = await env.SCHEDULE_KV.get(key.name, { type: 'json' });
      if (value && value.fileId) entries.push(value);
    }
  } while (cursor);
  return entries;
}

async function pruneCommunityCache(env, bytesNeeded = 0) {
  if (!env.COMMUNITY_R2) return;
  const config = getCommunityCacheConfig(env);
  const now = Date.now();
  const allEntries = await listCommunityCacheMetas(env);
  let entries = allEntries.filter(Boolean);

  for (const entry of entries) {
    const lastAccessAt = Date.parse(entry.lastAccessAt || entry.createdAt || 0);
    if (lastAccessAt && now - lastAccessAt > config.maxAgeMs) {
      await deleteCommunityCacheEntry(env, entry.fileId, entry);
    }
  }

  entries = (await listCommunityCacheMetas(env)).sort((a, b) => {
    const aTime = Date.parse(a.lastAccessAt || a.createdAt || 0) || 0;
    const bTime = Date.parse(b.lastAccessAt || b.createdAt || 0) || 0;
    return aTime - bTime;
  });

  let totalBytes = entries.reduce((sum, entry) => sum + Number(entry.byteSize || 0), 0);
  while (entries.length && totalBytes + bytesNeeded > config.maxBytes) {
    const victim = entries.shift();
    totalBytes -= Number(victim?.byteSize || 0);
    await deleteCommunityCacheEntry(env, victim.fileId, victim);
  }

  await setCommunityCacheSummary(env, {
    totalBytes: Math.max(0, totalBytes),
    itemCount: entries.length,
  });
}

async function touchCommunityCacheEntry(env, fileId) {
  const meta = await getCommunityCacheMeta(env, fileId);
  if (!meta) return;
  await setCommunityCacheMeta(env, fileId, {
    ...meta,
    lastAccessAt: new Date().toISOString(),
  });
}

async function cacheCommunityMedia(env, fileId, buffer, contentType, source = 'drive') {
  if (!canCacheCommunityMedia(contentType, buffer?.byteLength || 0, env)) return false;
  const byteSize = Number(buffer.byteLength || 0);
  const existingMeta = await getCommunityCacheMeta(env, fileId);
  const previousBytes = Number(existingMeta?.byteSize || 0);
  await pruneCommunityCache(env, Math.max(0, byteSize - previousBytes));
  await env.COMMUNITY_R2.put(fileId, buffer, {
    httpMetadata: { contentType },
    customMetadata: {
      source,
      cachedAt: new Date().toISOString(),
      byteSize: String(byteSize),
    }
  });
  await setCommunityCacheMeta(env, fileId, {
    fileId,
    byteSize,
    contentType,
    source,
    createdAt: existingMeta?.createdAt || new Date().toISOString(),
    lastAccessAt: new Date().toISOString(),
  });
  const summary = await getCommunityCacheSummary(env);
  await setCommunityCacheSummary(env, {
    totalBytes: Math.max(0, Number(summary.totalBytes || 0) - previousBytes + byteSize),
    itemCount: Math.max(0, Number(summary.itemCount || 0) + (existingMeta ? 0 : 1)),
  });
  return true;
}

function extractCommunityMediaFileId(mediaUrl) {
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

async function preheatCommunityMediaFile(env, fileId) {
  if (!fileId) return { status: 'invalid' };
  if (!env.COMMUNITY_R2) return { status: 'disabled' };

  try {
    const existing = await env.COMMUNITY_R2.head(fileId);
    if (existing) {
      await touchCommunityCacheEntry(env, fileId);
      return { status: 'hit' };
    }
  } catch (e) {}

  const drive = await getFromDrive(env, fileId);
  if (!drive.ok) return { status: 'missing' };

  const contentType = drive.headers.get('content-type') || 'image/jpeg';
  const buffer = await drive.arrayBuffer();
  if (!canCacheCommunityMedia(contentType, buffer.byteLength, env)) {
    return { status: 'skipped', reason: 'not_cacheable', byteSize: buffer.byteLength, contentType };
  }

  await cacheCommunityMedia(env, fileId, buffer, contentType, 'admin-preheat');
  return { status: 'cached', byteSize: buffer.byteLength, contentType };
}

async function collectRecentCommunityMediaFileIds(env, limit = 24) {
  const maxItems = Math.max(1, Math.min(80, Number(limit || 24)));
  const postRows = await env.COMMUNITY_DB.prepare("SELECT media_json FROM posts ORDER BY created_at DESC LIMIT ?").bind(Math.max(maxItems * 2, 40)).all();
  const userRows = await env.COMMUNITY_DB.prepare("SELECT avatar_url, background_url FROM users ORDER BY created_at DESC LIMIT ?").bind(Math.max(Math.ceil(maxItems / 2), 20)).all();
  const ids = [];
  const seen = new Set();

  const pushUrl = (value) => {
    const fileId = extractCommunityMediaFileId(value);
    if (!fileId || seen.has(fileId)) return;
    seen.add(fileId);
    ids.push(fileId);
  };

  for (const row of postRows.results || []) {
    try {
      const items = JSON.parse(row.media_json || '[]');
      for (const item of Array.isArray(items) ? items : []) {
        pushUrl(item?.url);
        if (ids.length >= maxItems) return ids;
      }
    } catch (e) {}
  }

  for (const row of userRows.results || []) {
    pushUrl(row.avatar_url);
    if (ids.length >= maxItems) return ids;
    pushUrl(row.background_url);
    if (ids.length >= maxItems) return ids;
  }

  return ids.slice(0, maxItems);
}

const DEFAULT_COMMUNITY_GROUPS = [
  {
    id: 'group-campus-pulse',
    title: 'Campus Pulse',
    description: '全站信息流的延伸空间，适合发起临时协作、问路和实时讨论。'
  },
  {
    id: 'group-night-studio',
    title: 'Night Studio',
    description: '晚修、任务推进和互相催更的高密度讨论组。'
  },
  {
    id: 'group-xiangqi-lab',
    title: 'Xiangqi Lab',
    description: '象棋对局、复盘和残局研究集中区。'
  },
  {
    id: 'group-node-radar',
    title: 'Node Radar',
    description: '节点分享、测速反馈和网络状态交流。'
  }
];

let communityMessagingSetupPromise = null;

function buildDirectConversationKey(userA, userB) {
  return [String(userA || '').trim(), String(userB || '').trim()].sort().join(':');
}

let driveSetupPromise = null;
async function ensureDriveSchema(env) {
  if (driveSetupPromise) return driveSetupPromise;
  driveSetupPromise = (async () => {
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`
        CREATE TABLE IF NOT EXISTS user_drive_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          quota_bytes INTEGER DEFAULT 0,
          used_bytes INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      env.COMMUNITY_DB.prepare(`
        CREATE TABLE IF NOT EXISTS drive_files (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          mime_type TEXT,
          url TEXT,
          parent_id TEXT,
          is_folder INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      env.COMMUNITY_DB.prepare("CREATE INDEX IF NOT EXISTS idx_drive_files_user ON drive_files(user_id, parent_id)")
    ]);
  })().catch(error => {
    driveSetupPromise = null;
    throw error;
  });
  return driveSetupPromise;
}

async function ensureCommunityMessagingSchema(env) {
  if (communityMessagingSetupPromise) return communityMessagingSetupPromise;

  communityMessagingSetupPromise = (async () => {
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'direct',
          title TEXT,
          description TEXT,
          avatar_url TEXT,
          direct_key TEXT UNIQUE,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      env.COMMUNITY_DB.prepare(`
        CREATE TABLE IF NOT EXISTS conversation_members (
          conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          role TEXT DEFAULT 'member',
          last_read_at DATETIME,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(conversation_id, user_id)
        )
      `),
      env.COMMUNITY_DB.prepare(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          meta_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      env.COMMUNITY_DB.prepare("CREATE INDEX IF NOT EXISTS idx_conversations_kind_updated ON conversations(kind, updated_at DESC)"),
      env.COMMUNITY_DB.prepare("CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id, joined_at DESC)"),
      env.COMMUNITY_DB.prepare("CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC)")
    ]);

    for (const group of DEFAULT_COMMUNITY_GROUPS) {
      await env.COMMUNITY_DB.prepare(`
        INSERT OR IGNORE INTO conversations (id, kind, title, description, direct_key, created_by, updated_at)
        VALUES (?, 'group', ?, ?, NULL, NULL, CURRENT_TIMESTAMP)
      `).bind(group.id, group.title, group.description).run();
    }
  })().catch(error => {
    communityMessagingSetupPromise = null;
    throw error;
  });

  return communityMessagingSetupPromise;
}

async function getConversationMembership(env, conversationId, userId) {
  return await env.COMMUNITY_DB.prepare(`
    SELECT c.*, cm.role AS member_role, cm.last_read_at, cm.joined_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id = ? AND cm.user_id = ?
  `).bind(conversationId, userId).first();
}

async function serializeConversation(env, conversation, viewerId) {
  if (!conversation) return null;
  const base = {
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title || '',
    description: conversation.description || '',
    avatar_url: conversation.avatar_url || '',
    member_role: conversation.member_role || 'member',
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    joined: true,
    member_count: Number(conversation.member_count || 0),
    unread_count: Number(conversation.unread_count || 0),
    last_message: conversation.last_message || '',
    last_message_at: conversation.last_message_at || conversation.updated_at,
    last_sender_name: conversation.last_sender_name || '',
  };

  if (conversation.kind === 'direct') {
    const partner = await env.COMMUNITY_DB.prepare(`
      SELECT u.id, u.username, u.avatar_url, u.signature, COALESCE(u.xp, 0) AS xp, COALESCE(u.level, 1) AS level, COALESCE(u.role, 'user') AS role
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ?
      LIMIT 1
    `).bind(conversation.id, viewerId).first();

    if (partner) {
      const normalizedPartner = withCommunityLevel({ ...partner, role: normalizeCommunityRole(partner, env) });
      base.partner = {
        id: normalizedPartner.id,
        username: normalizedPartner.username,
        avatar_url: normalizedPartner.avatar_url,
        signature: normalizedPartner.signature,
        xp: normalizedPartner.xp,
        level: normalizedPartner.level,
        role: normalizedPartner.role
      };
      base.title = normalizedPartner.username || base.title || '未命名会话';
      base.avatar_url = normalizedPartner.avatar_url || base.avatar_url;
      base.description = normalizedPartner.signature || base.description;
    }
  }

  return base;
}

async function listUserConversations(env, userId) {
  const rows = await env.COMMUNITY_DB.prepare(`
    SELECT
      c.*,
      cm.role AS member_role,
      (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
      (SELECT COALESCE(u.username, '系统') FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_name,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND datetime(created_at) > datetime(COALESCE(cm.last_read_at, '1970-01-01 00:00:00'))) AS unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY datetime(COALESCE((SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), c.updated_at)) DESC
    LIMIT 50
  `).bind(userId).all();

  const conversations = [];
  for (const row of rows.results || []) {
    conversations.push(await serializeConversation(env, row, userId));
  }
  return conversations.filter(Boolean);
}
const LINK_PREVIEW_TIMEOUT_MS = 8000;
const LINK_PREVIEW_MAX_BYTES = 1_500_000;
const DEFAULT_MUSIC_PUBLIC_BASE_URL = 'https://thefallback.cc.cd';

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function corsResp() {
  return new Response(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeObjectKey(key) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(safeDecodeURIComponent(part)))
    .join('/');
}

function getMusicPublicBaseUrl(env) {
  return String(env.MUSIC_PUBLIC_BASE_URL || DEFAULT_MUSIC_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

function buildMusicPublicUrl(env, key) {
  const encodedKey = encodeObjectKey(key);
  return encodedKey ? `${getMusicPublicBaseUrl(env)}/${encodedKey}` : getMusicPublicBaseUrl(env);
}

function extractMusicObjectKey(trackUrl) {
  const rawUrl = String(trackUrl || '').trim();
  if (!rawUrl) return '';

  try {
    const parsed = new URL(rawUrl);
    return safeDecodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return safeDecodeURIComponent(rawUrl.replace(/^\/+/, ''));
  }
}

function normalizeMusicTrack(env, track, requestHost) {
  if (!track || typeof track !== 'object') return track;
  const next = { ...track };
  const rawUrl = String(track.url || '').trim();
  if (!rawUrl) return next;

  try {
    const parsed = new URL(rawUrl);
    const legacyHosts = new Set([
      'thefallback.cc.cd',
      'www.thefallback.cc.cd',
      'media.thefallback.cc.cd',
      requestHost,
    ].filter(Boolean));

    if (legacyHosts.has(parsed.hostname)) {
      const objectKey = parsed.pathname.replace(/^\/+/, '');
      if (objectKey) next.url = buildMusicPublicUrl(env, objectKey);
    }
  } catch {
    const objectKey = rawUrl.replace(/^\/+/, '');
    if (objectKey) next.url = buildMusicPublicUrl(env, objectKey);
  }

  return next;
}

function mergeMusicPlaylist(env, storedList, bucketObjects) {
  const savedTracks = Array.isArray(storedList) ? storedList.filter(track => track && typeof track === 'object') : [];
  const savedByKey = new Map();
  const savedOrder = new Map();
  const externalTracks = [];

  savedTracks.forEach((track, index) => {
    const objectKey = extractMusicObjectKey(track.url);
    if (!objectKey || objectKey === 'playlist.json') {
      externalTracks.push(track);
      return;
    }
    if (!savedByKey.has(objectKey)) {
      savedByKey.set(objectKey, track);
      savedOrder.set(objectKey, index);
    }
  });

  const mergedBucketTracks = bucketObjects
    .filter(obj => obj.key.toLowerCase().endsWith('.mp3'))
    .map(obj => {
      const saved = savedByKey.get(obj.key);
      const fallbackName = safeDecodeURIComponent(obj.key.replace(/\.[^/.]+$/, '')) || '未知';
      return {
        name: (saved && String(saved.name || '').trim()) || fallbackName,
        artist: saved && typeof saved.artist === 'string' ? saved.artist : 'R2 Drive',
        url: buildMusicPublicUrl(env, obj.key),
      };
    })
    .sort((a, b) => {
      const aKey = extractMusicObjectKey(a.url);
      const bKey = extractMusicObjectKey(b.url);
      const aOrder = savedOrder.has(aKey) ? savedOrder.get(aKey) : Number.MAX_SAFE_INTEGER;
      const bOrder = savedOrder.has(bKey) ? savedOrder.get(bKey) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

  const normalizedExternalTracks = externalTracks
    .map(track => normalizeMusicTrack(env, track, ''))
    .filter(track => track && String(track.url || '').trim());

  return [...mergedBucketTracks, ...normalizedExternalTracks];
}

async function verifyAdmin(env, username, password) {
  const storedUser = await env.SCHEDULE_KV.get('nodes_admin_user') || DEFAULT_ADMIN_USER;
  const storedPass = await env.SCHEDULE_KV.get('nodes_admin_pass') || DEFAULT_ADMIN_PASS;
  return username === storedUser && password === storedPass;
}

function parseNodes(rawText) {
  let decoded = rawText.trim();
  try { const b64 = atob(decoded); if (b64.includes('://')) decoded = b64; } catch {}
  return decoded.split('\n').map(l => l.trim()).filter(l => l.startsWith('ss://') || l.startsWith('vmess://') || l.startsWith('trojan://') || l.startsWith('vless://') || l.startsWith('ssr://'))
    .map(raw => {
      let name = '未知节点';
      try {
        if (raw.startsWith('vmess://')) { const json = JSON.parse(atob(raw.slice(8))); name = json.ps || json.add || 'vmess节点'; }
        else { const hashPart = raw.split('#')[1]; if (hashPart) name = decodeURIComponent(hashPart.split('\r')[0]); else name = raw.split('://')[0].toUpperCase() + '节点'; }
      } catch {}
      return { name: name.trim(), raw };
    });
}

// ── Google Drive API Helpers (OAuth2 User Flow) ────────────────
async function getGoogleAuthToken(env, forceRefresh = false) {
  // 1. 尝试从 KV 获取缓存的 Token (除非强制刷新)
  if (!forceRefresh) {
    const cached = await env.SCHEDULE_KV.get('gdrive_token_cache', { type: 'json' });
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
  }

  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = env;
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
    throw new Error('缺失 OAuth2 凭据 (Client ID, Secret, 或 Refresh Token)。请在 Cloudflare 后台设置环境变量。');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    if (data.error === 'invalid_grant') {
      throw new Error('Google Refresh Token 已过期或被撤销，请重新获取 Refresh Token。');
    }
    throw new Error(`OAuth2 刷新失败: ${data.error_description || data.error}`);
  }
  
  const accessToken = data.access_token;
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;

  // 2. 将新 Token 存入 KV
  await env.SCHEDULE_KV.put('gdrive_token_cache', JSON.stringify({
    token: accessToken,
    expiresAt
  }), { expirationTtl: Math.floor((data.expires_in || 3600) - 60) });

  return accessToken;
}

async function uploadToDrive(env, fileBuffer, fileName, mimeType, retry = true) {
  let token = await getGoogleAuthToken(env);
  const metadata = { name: fileName, parents: [env.GDRIVE_FOLDER_ID] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileBuffer], { type: mimeType }));
  
  let resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });

  // 如果返回 401 且允许重试，强制刷新 Token 再试一次
  if (resp.status === 401 && retry) {
    console.warn("Access Token 疑似失效，正在强制刷新...");
    token = await getGoogleAuthToken(env, true);
    resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });
  }

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error ? data.error.message : 'Upload Failed');
  return data;
}

async function getFromDrive(env, fileId, retry = true) {
  let token = await getGoogleAuthToken(env);
  let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (resp.status === 401 && retry) {
    token = await getGoogleAuthToken(env, true);
    resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }
  return resp;
}

async function sha256Hex(input) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)))
  ).map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractMetaTag(html, key, attr = 'property') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverseRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escaped}["'][^>]*>`, 'i');
  const match = html.match(regex) || html.match(reverseRegex);
  return match ? match[1].trim() : '';
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').trim();
}

function cleanPreviewTitle(title, host) {
  const raw = String(title || '').trim();
  if (!raw) return '';
  if (host.includes('bilibili.com') || host === 'b23.tv') {
    return raw.replace(/[-_ ]*哔哩哔哩.*$/i, '').replace(/[-_ ]*bilibili.*$/i, '').trim();
  }
  if (host.includes('xiaohongshu.com')) {
    return raw.replace(/[-_ ]*小红书.*$/i, '').trim();
  }
  if (host.includes('douyin.com')) {
    return raw.replace(/[-_ ]*抖音.*$/i, '').trim();
  }
  if (host.includes('weibo.com')) {
    return raw.replace(/[-_ ]*微博.*$/i, '').trim();
  }
  if (host.includes('youtube.com') || host === 'youtu.be') {
    return raw.replace(/[-_ ]*youtube.*$/i, '').trim();
  }
  return raw;
}

function createTimeoutError(message = 'Operation timed out') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(createTimeoutError(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function createPreviewTooLargeError() {
  const error = new Error('LINK_PREVIEW_TOO_LARGE');
  error.code = 'LINK_PREVIEW_TOO_LARGE';
  return error;
}

function isPreviewTooLargeError(error) {
  return error?.code === 'LINK_PREVIEW_TOO_LARGE' || String(error?.message || '') === 'LINK_PREVIEW_TOO_LARGE';
}

async function readResponseTextWithLimit(resp, maxBytes = LINK_PREVIEW_MAX_BYTES, timeoutMs = LINK_PREVIEW_TIMEOUT_MS) {
  if (!resp?.body?.getReader) {
    const text = await withTimeout(resp.text(), timeoutMs, 'Preview body timeout');
    if (new TextEncoder().encode(text).length > maxBytes) throw createPreviewTooLargeError();
    return text;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
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
    try { await reader.cancel(); } catch {}
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

function buildFallbackPreview(targetUrl, reason = '') {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(Boolean).map(part => safeDecodeURIComponent(part));
    let title = '';

    if (host.includes('bilibili.com') || host === 'b23.tv') {
      const bv = pathParts.find(part => /^BV/i.test(part));
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

function getPreviewFetchHeaders(extra = {}) {
  return {
    'user-agent': 'Mozilla/5.0 (compatible; 8communityBot/1.0; +https://thefallback.cc.cd)',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...extra,
  };
}

function extractBilibiliBvid(value) {
  const raw = String(value || '');
  const match = raw.match(/BV[0-9A-Za-z]{10}/i);
  return match ? match[0].toUpperCase() : '';
}

function getBilibiliCanonicalUrl(bvid) {
  return `https://www.bilibili.com/video/${encodeURIComponent(bvid)}`;
}

function isYouTubeHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com';
}

function normalizeBilibiliImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;
  return raw;
}

async function fetchBilibiliPreview(targetUrl) {
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
        const redirectedUrl = new URL(location, target.toString()).toString();
        bvid = extractBilibiliBvid(redirectedUrl);
      }
    } catch {}
  }

  if (!bvid) return null;

  const apiResp = await fetchWithTimeout(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
    headers: getPreviewFetchHeaders({ accept: 'application/json' })
  });
  if (!apiResp.ok) return null;

  const payload = await apiResp.json();
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
  const host = 'bilibili.com';

  return {
    url: getBilibiliCanonicalUrl(bvid),
    title: cleanPreviewTitle(data.title, host),
    image: normalizeBilibiliImageUrl(data.pic),
    description: description && description !== '-' ? description : (ownerName ? `UP主：${ownerName}` : ''),
    host
  };
}

function extractYouTubeVideoId(targetUrl) {
  try {
    const url = new URL(targetUrl);
    if (url.hostname === 'youtu.be') {
      return url.pathname.replace(/^\/+/, '').split('/')[0];
    }
    if (url.pathname === '/watch') {
      return url.searchParams.get('v') || '';
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      return parts[1] || '';
    }
  } catch {}
  return '';
}

function getYouTubeCanonicalUrl(videoId, fallbackUrl = '') {
  if (videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return String(fallbackUrl || '');
}

function normalizeYouTubeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

async function fetchYouTubePreview(targetUrl) {
  const canonicalUrl = getYouTubeCanonicalUrl(extractYouTubeVideoId(targetUrl), targetUrl);
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
  const resp = await fetchWithTimeout(oembedUrl, {
    headers: getPreviewFetchHeaders({ accept: 'application/json' })
  });
  if (!resp.ok) return null;

  const data = await resp.json();
  if (!data?.title) return null;

  return {
    url: canonicalUrl,
    title: cleanPreviewTitle(data.title, 'youtube.com'),
    image: normalizeYouTubeImageUrl(data.thumbnail_url),
    description: data.author_name ? `频道：${String(data.author_name).trim()}` : '',
    host: 'youtube.com'
  };
}

async function fetchWithTimeout(resource, init = {}, timeoutMs = LINK_PREVIEW_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isAbortLikeError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  return name === 'AbortError' || /aborted|timeout/i.test(message);
}

function isPrivatePreviewHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home') || host.endsWith('.lan')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  return false;
}

function absolutizePreviewUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch (e) {
    return value;
  }
}

// FINAL DEPLOY V4.3 - Optimized Storage & Auth
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResp();

    if (url.pathname === '/api/data' || url.pathname === '/api/schedule') {
      if (request.method === 'GET') return new Response(await env.SCHEDULE_KV.get('schedule_data') || '{"S":null}', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      if (request.method === 'POST') { await env.SCHEDULE_KV.put('schedule_data', await request.text()); return jsonResp({ ok: true }); }
    }

    if (url.pathname === '/api/proxy-gemini' && request.method === 'POST') {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyAx1iLyi7qIO9KLBMtc_1wey18Eaz1J9H0`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await request.text() });
      return new Response(await resp.text(), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (url.pathname === '/api/nodes') {
      if (request.method === 'GET') {
        const pwd = url.searchParams.get('pwd') || '';
        if (pwd !== await env.SCHEDULE_KV.get('nodes_user_pwd')) return jsonResp({ ok: false, msg: '无权访问' }, 401);
        return new Response(await env.SCHEDULE_KV.get('nodes_list') || '[]', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (!(await verifyAdmin(env, body.adminUser, body.adminPass))) return jsonResp({ ok: false, msg: '认证失败' }, 401);
        if (body.action === 'getNodes') return jsonResp({ ok: true, nodes: JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]') });
        if (body.action === 'clearNodes') { await env.SCHEDULE_KV.put('nodes_list', '[]'); return jsonResp({ ok: true }); }
        return jsonResp({ ok: false, msg: '未知操作' }, 400);
      }
    }

    if (url.pathname === '/api/music') {
      if (request.method === 'GET') {
        try {
          // 始终扫描 R2，避免新上传的歌曲被旧 playlist.json 遗漏
          const playlistObj = await env.MUSIC_BUCKET.get('playlist.json');
          let storedList = [];
          if (playlistObj) {
            storedList = await playlistObj.json();
          }

          const listed = await env.MUSIC_BUCKET.list();
          const list = mergeMusicPlaylist(env, storedList, listed.objects || []);
          return jsonResp(list);
        } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
      }
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          if (!(await verifyAdmin(env, body.adminUser, body.adminPass))) return jsonResp({ ok: false, msg: '认证失败' }, 401);
          if (body.action === 'setList') {
            await env.MUSIC_BUCKET.put('playlist.json', JSON.stringify(body.list));
            return jsonResp({ ok: true });
          }
          return jsonResp({ ok: false, msg: '未知操作' }, 400);
        } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
      }
    }

    if (url.pathname.startsWith('/api/community/')) {
      const getAuth = async () => {
        const auth = request.headers.get('Authorization') || '';
        if (!auth.startsWith('Bearer ')) return null;
        const raw = auth.slice(7);
        const sep = raw.indexOf(':');
        if (sep === -1) return null;
        const rawUser = raw.slice(0, sep);
        const p = raw.slice(sep + 1);
        let u = rawUser;
        try {
          u = decodeURIComponent(rawUser);
        } catch (e) {}
        const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(u, p).first();
        if (user && user.is_banned) return null;
        return withCommunityLevel(withCommunityRole(user, env));
      };

      const awardXP = async (userId, amount) => {
        const current = await env.COMMUNITY_DB.prepare("SELECT xp FROM users WHERE id = ?").bind(userId).first();
        if (!current) return;
        const nextXp = Math.max(0, Number(current.xp || 0)) + Number(amount || 0);
        const nextLevel = getCommunityLevelFromXp(nextXp);
        await env.COMMUNITY_DB.prepare("UPDATE users SET xp = ?, level = ? WHERE id = ?").bind(nextXp, nextLevel, userId).run();
      };

      const addNotify = async (userId, type, fromUserId, targetId) => {
        const userIds = Array.isArray(userId) ? userId : [userId];
        const validIds = userIds.filter(id => id !== fromUserId);
        if (validIds.length === 0) return;

        const statements = validIds.map(id =>
          env.COMMUNITY_DB.prepare("INSERT INTO notifications (id, user_id, type, from_user_id, target_id) VALUES (?, ?, ?, ?, ?)")
            .bind(crypto.randomUUID(), id, type, fromUserId, targetId)
        );

        if (statements.length === 1) {
          await statements[0].run();
        } else {
          await env.COMMUNITY_DB.batch(statements);
        }
      };

      if (url.pathname === '/api/community/discovery' && request.method === 'GET') {
        await ensureCommunityMessagingSchema(env);
        const viewer = await getAuth();
        const q = String(url.searchParams.get('q') || '').trim();
        const likeQuery = `%${q}%`;

        const userSql = q
          ? `
            SELECT id, username, avatar_url, signature, COALESCE(xp, 0) AS xp, COALESCE(level, 1) AS level, COALESCE(role, 'user') AS role
            FROM users
            WHERE is_banned = 0 AND (username LIKE ? OR COALESCE(signature, '') LIKE ?)
            ORDER BY xp DESC, created_at DESC
            LIMIT 8
          `
          : `
            SELECT id, username, avatar_url, signature, COALESCE(xp, 0) AS xp, COALESCE(level, 1) AS level, COALESCE(role, 'user') AS role
            FROM users
            WHERE is_banned = 0
            ORDER BY xp DESC, created_at DESC
            LIMIT 8
          `;
        const userRows = await env.COMMUNITY_DB.prepare(userSql).bind(...(q ? [likeQuery, likeQuery] : [])).all();

        const groupSql = q
          ? `
            SELECT
              c.id,
              c.title,
              c.description,
              c.avatar_url,
              c.updated_at,
              (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count,
              ? IS NOT NULL AND EXISTS(
                SELECT 1 FROM conversation_members cm
                WHERE cm.conversation_id = c.id AND cm.user_id = ?
              ) AS joined
            FROM conversations c
            WHERE c.kind = 'group' AND (COALESCE(c.title, '') LIKE ? OR COALESCE(c.description, '') LIKE ?)
            ORDER BY datetime(c.updated_at) DESC, c.title COLLATE NOCASE ASC
            LIMIT 8
          `
          : `
            SELECT
              c.id,
              c.title,
              c.description,
              c.avatar_url,
              c.updated_at,
              (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) AS member_count,
              ? IS NOT NULL AND EXISTS(
                SELECT 1 FROM conversation_members cm
                WHERE cm.conversation_id = c.id AND cm.user_id = ?
              ) AS joined
            FROM conversations c
            WHERE c.kind = 'group'
            ORDER BY datetime(c.updated_at) DESC, c.title COLLATE NOCASE ASC
            LIMIT 8
          `;
        const groupRows = await env.COMMUNITY_DB.prepare(groupSql).bind(
          viewer?.id || null,
          viewer?.id || null,
          ...(q ? [likeQuery, likeQuery] : [])
        ).all();

        const users = (userRows.results || [])
          .filter(row => row.id !== viewer?.id)
          .map(row => {
            const normalized = withCommunityLevel({ ...row, role: normalizeCommunityRole(row, env) });
            return {
              id: normalized.id,
              username: normalized.username,
              avatar_url: normalized.avatar_url,
              signature: normalized.signature,
              xp: normalized.xp,
              level: normalized.level,
              role: normalized.role
            };
          });

        const groups = (groupRows.results || []).map(row => ({
          id: row.id,
          title: row.title,
          description: row.description,
          avatar_url: row.avatar_url,
          updated_at: row.updated_at,
          member_count: Number(row.member_count || 0),
          joined: !!row.joined
        }));

        return jsonResp({ ok: true, users, groups, query: q });
      }

            if (url.pathname === '/api/community/drive/info' && request.method === 'GET') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        await ensureDriveSchema(env);
        const stats = await env.COMMUNITY_DB.prepare("SELECT quota_bytes, used_bytes FROM user_drive_stats WHERE user_id = ?").bind(user.id).first() || { quota_bytes: 0, used_bytes: 0 };
        return jsonResp({ ok: true, stats });
      }

      if (url.pathname === '/api/community/drive/list' && request.method === 'GET') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        await ensureDriveSchema(env);
        const parentId = url.searchParams.get('parent_id') || null;
        let query = "SELECT id, name, size, mime_type, url, parent_id, is_folder, created_at, updated_at FROM drive_files WHERE user_id = ?";
        if (parentId) query += " AND parent_id = ?";
        else query += " AND parent_id IS NULL";
        query += " ORDER BY is_folder DESC, created_at DESC";
        const stmt = parentId ? env.COMMUNITY_DB.prepare(query).bind(user.id, parentId) : env.COMMUNITY_DB.prepare(query).bind(user.id);
        const files = await stmt.all();
        return jsonResp({ ok: true, files: files.results || [] });
      }

      if (url.pathname === '/api/community/drive/mkdir' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        await ensureDriveSchema(env);
        const { name, parent_id } = await request.json();
        const id = crypto.randomUUID();
        await env.COMMUNITY_DB.prepare(
          "INSERT INTO drive_files (id, user_id, name, parent_id, is_folder) VALUES (?, ?, ?, ?, 1)"
        ).bind(id, user.id, name, parent_id || null).run();
        return jsonResp({ ok: true, id });
      }

      if (url.pathname === '/api/community/drive/delete' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        await ensureDriveSchema(env);
        const { ids } = await request.json();
        if (!ids || !ids.length) return jsonResp({ ok: true });
        
        let freedSpace = 0;
        for (const id of ids) {
          const file = await env.COMMUNITY_DB.prepare("SELECT size, url, is_folder FROM drive_files WHERE id = ? AND user_id = ?").bind(id, user.id).first();
          if (file) {
            if (!file.is_folder) {
              freedSpace += file.size;
              if (env.COMMUNITY_R2 && file.url) {
                try {
                   const fileId = extractCommunityMediaFileId(file.url);
                   if (fileId) await env.COMMUNITY_R2.delete(fileId);
                } catch(e){}
              }
            }
            await env.COMMUNITY_DB.prepare("DELETE FROM drive_files WHERE id = ? AND user_id = ?").bind(id, user.id).run();
          }
        }
        if (freedSpace > 0) {
          await env.COMMUNITY_DB.prepare("UPDATE user_drive_stats SET used_bytes = MAX(0, used_bytes - ?) WHERE user_id = ?").bind(freedSpace, user.id).run();
        }
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/drive/rename' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        await ensureDriveSchema(env);
        const { id, name } = await request.json();
        await env.COMMUNITY_DB.prepare("UPDATE drive_files SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(name, id, user.id).run();
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/drive/upload' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        await ensureDriveSchema(env);
        
        const stats = await env.COMMUNITY_DB.prepare("SELECT quota_bytes, used_bytes FROM user_drive_stats WHERE user_id = ?").bind(user.id).first() || { quota_bytes: 0, used_bytes: 0 };
        const contentLength = Number(request.headers.get('content-length') || 0);
        if (stats.used_bytes + contentLength > stats.quota_bytes) {
           return jsonResp({ ok: false, msg: '空间不足' }, 403);
        }
        if (!env.COMMUNITY_R2) return jsonResp({ ok: false, msg: '存储未配置' }, 500);

        try {
          const formData = await request.formData();
          const file = formData.get('file');
          const parent_id = formData.get('parent_id') || null;
          if (!file || !file.name) return jsonResp({ ok: false, msg: 'No file' }, 400);

          const id = crypto.randomUUID();
          const ext = file.name.split('.').pop() || 'bin';
          const r2Key = `drive-${user.id}-${id}.${ext}`;
          
          await env.COMMUNITY_R2.put(r2Key, file.stream(), {
            httpMetadata: { contentType: file.type || 'application/octet-stream' }
          });
          const fileUrl = `/api/community/media/${r2Key}`;
          
          await env.COMMUNITY_DB.prepare(
            "INSERT INTO drive_files (id, user_id, name, size, mime_type, url, parent_id, is_folder) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
          ).bind(id, user.id, file.name, file.size, file.type || '', fileUrl, parent_id).run();
          
          await env.COMMUNITY_DB.prepare(
            "INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET used_bytes = used_bytes + excluded.used_bytes"
          ).bind(user.id, file.size).run();
          
          return jsonResp({ ok: true, id, url: fileUrl });
        } catch(e) {
          return jsonResp({ ok: false, msg: 'Upload failed: ' + e.message }, 500);
        }
      }

      if (url.pathname === '/api/community/chats' && request.method === 'GET') {
        await ensureCommunityMessagingSchema(env);
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const conversations = await listUserConversations(env, user.id);
        const unread_total = conversations.reduce((sum, item) => sum + Number(item?.unread_count || 0), 0);
        return jsonResp({ ok: true, conversations, unread_total });
      }

      if (url.pathname === '/api/community/chats/direct' && request.method === 'POST') {
        await ensureCommunityMessagingSchema(env);
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);

        const { target_user_id } = await request.json();
        const targetId = String(target_user_id || '').trim();
        if (!targetId || targetId === user.id) return jsonResp({ ok: false, msg: '目标用户无效' }, 400);

        const targetUser = await env.COMMUNITY_DB.prepare("SELECT id FROM users WHERE id = ? AND is_banned = 0").bind(targetId).first();
        if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);

        const directKey = buildDirectConversationKey(user.id, targetId);
        let conversation = await env.COMMUNITY_DB.prepare("SELECT * FROM conversations WHERE direct_key = ? LIMIT 1").bind(directKey).first();

        if (!conversation) {
          const conversationId = crypto.randomUUID();
          await env.COMMUNITY_DB.prepare(`
            INSERT INTO conversations (id, kind, title, description, avatar_url, direct_key, created_by, updated_at)
            VALUES (?, 'direct', '', '', '', ?, ?, CURRENT_TIMESTAMP)
          `).bind(conversationId, directKey, user.id).run();

          await env.COMMUNITY_DB.batch([
            env.COMMUNITY_DB.prepare(`
              INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
              VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
            `).bind(conversationId, user.id),
            env.COMMUNITY_DB.prepare(`
              INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
              VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
            `).bind(conversationId, targetId)
          ]);

          conversation = await env.COMMUNITY_DB.prepare("SELECT * FROM conversations WHERE id = ?").bind(conversationId).first();
        }

        const membership = await getConversationMembership(env, conversation.id, user.id);
        const detail = await serializeConversation(env, {
          ...conversation,
          member_role: membership?.member_role || 'member',
          member_count: 2,
          unread_count: 0
        }, user.id);
        return jsonResp({ ok: true, conversation: detail });
      }

      if (url.pathname === '/api/community/chats/messages' && request.method === 'GET') {
        await ensureCommunityMessagingSchema(env);
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);

        const conversationId = String(url.searchParams.get('conversation_id') || '').trim();
        if (!conversationId) return jsonResp({ ok: false, msg: '缺少会话 ID' }, 400);

        const membership = await getConversationMembership(env, conversationId, user.id);
        if (!membership) return jsonResp({ ok: false, msg: '会话不存在' }, 404);

        const rows = await env.COMMUNITY_DB.prepare(`
          SELECT
            m.*,
            u.username,
            u.avatar_url,
            COALESCE(u.xp, 0) AS xp,
            COALESCE(u.level, 1) AS level,
            COALESCE(u.role, 'user') AS role
          FROM messages m
          LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = ?
          ORDER BY datetime(m.created_at) DESC
          LIMIT 80
        `).bind(conversationId).all();

        await env.COMMUNITY_DB.prepare(`
          UPDATE conversation_members
          SET last_read_at = CURRENT_TIMESTAMP
          WHERE conversation_id = ? AND user_id = ?
        `).bind(conversationId, user.id).run();

        const messages = (rows.results || []).reverse().map(row => {
          const sender = row.sender_id
            ? withCommunityLevel({ ...row, role: normalizeCommunityRole(row, env) })
            : null;
          return {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            content: row.content,
            meta_json: row.meta_json,
            created_at: row.created_at,
            sender: sender ? {
              id: sender.sender_id,
              username: sender.username,
              avatar_url: sender.avatar_url,
              xp: sender.xp,
              level: sender.level,
              role: sender.role
            } : null
          };
        });

        return jsonResp({ ok: true, messages });
      }

      if (url.pathname === '/api/community/chats/messages' && request.method === 'POST') {
        await ensureCommunityMessagingSchema(env);
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);

        const { conversation_id, content, meta } = await request.json();
        const conversationId = String(conversation_id || '').trim();
        const trimmedContent = String(content || '').trim();
        if (!conversationId || !trimmedContent) return jsonResp({ ok: false, msg: '消息内容不能为空' }, 400);

        const membership = await getConversationMembership(env, conversationId, user.id);
        if (!membership) return jsonResp({ ok: false, msg: '会话不存在' }, 404);

        const messageId = crypto.randomUUID();
        await env.COMMUNITY_DB.batch([
          env.COMMUNITY_DB.prepare(`
            INSERT INTO messages (id, conversation_id, sender_id, content, meta_json)
            VALUES (?, ?, ?, ?, ?)
          `).bind(messageId, conversationId, user.id, trimmedContent, JSON.stringify(meta || {})),
          env.COMMUNITY_DB.prepare(`
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(conversationId),
          env.COMMUNITY_DB.prepare(`
            UPDATE conversation_members
            SET last_read_at = CURRENT_TIMESTAMP
            WHERE conversation_id = ? AND user_id = ?
          `).bind(conversationId, user.id)
        ]);

        const conversation = await env.COMMUNITY_DB.prepare("SELECT kind FROM conversations WHERE id = ?").bind(conversationId).first();
        if (conversation?.kind === 'direct') {
          const peerRows = await env.COMMUNITY_DB.prepare(`
            SELECT user_id
            FROM conversation_members
            WHERE conversation_id = ? AND user_id != ?
          `).bind(conversationId, user.id).all();
          const targetIds = (peerRows.results || []).map(row => row.user_id);
          if (targetIds.length > 0) {
            await addNotify(targetIds, 'message', user.id, conversationId);
          }
        }

        return jsonResp({
          ok: true,
          message: {
            id: messageId,
            conversation_id: conversationId,
            sender_id: user.id,
            content: trimmedContent,
            created_at: new Date().toISOString(),
            sender: {
              id: user.id,
              username: user.username,
              avatar_url: user.avatar_url,
              xp: user.xp,
              level: user.level,
              role: user.role
            }
          }
        });
      }

      if (url.pathname === '/api/community/groups' && request.method === 'POST') {
        await ensureCommunityMessagingSchema(env);
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);

        const body = await request.json();
        const title = String(body.title || '').trim();
        const description = String(body.description || '').trim();
        const memberIds = Array.from(new Set((Array.isArray(body.member_ids) ? body.member_ids : []).map(value => String(value || '').trim()).filter(Boolean)));

        if (!title) return jsonResp({ ok: false, msg: '群组名称不能为空' }, 400);
        if (title.length > 42) return jsonResp({ ok: false, msg: '群组名称太长了' }, 400);

        const validMembers = memberIds.filter(id => id !== user.id).slice(0, 12);
        const conversationId = crypto.randomUUID();
        await env.COMMUNITY_DB.prepare(`
          INSERT INTO conversations (id, kind, title, description, avatar_url, direct_key, created_by, updated_at)
          VALUES (?, 'group', ?, ?, '', NULL, ?, CURRENT_TIMESTAMP)
        `).bind(conversationId, title, description, user.id).run();

        const insertStatements = [
          env.COMMUNITY_DB.prepare(`
            INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
            VALUES (?, ?, 'owner', CURRENT_TIMESTAMP)
          `).bind(conversationId, user.id)
        ];

        for (const memberId of validMembers) {
          insertStatements.push(
            env.COMMUNITY_DB.prepare(`
              INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
              VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
            `).bind(conversationId, memberId)
          );
        }

        await env.COMMUNITY_DB.batch(insertStatements);
        return jsonResp({ ok: true, conversation_id: conversationId });
      }

      if (url.pathname === '/api/community/groups/join' && request.method === 'POST') {
        await ensureCommunityMessagingSchema(env);
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);

        const { conversation_id } = await request.json();
        const conversationId = String(conversation_id || '').trim();
        const group = await env.COMMUNITY_DB.prepare(`
          SELECT id, kind
          FROM conversations
          WHERE id = ?
        `).bind(conversationId).first();
        if (!group || group.kind !== 'group') return jsonResp({ ok: false, msg: '群组不存在' }, 404);

        await env.COMMUNITY_DB.batch([
          env.COMMUNITY_DB.prepare(`
            INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at)
            VALUES (?, ?, 'member', CURRENT_TIMESTAMP)
          `).bind(conversationId, user.id),
          env.COMMUNITY_DB.prepare(`
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(conversationId)
        ]);

        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/auth' && request.method === 'POST') {
        try {
          const { action, username, password } = await request.json();
          const passHash = await sha256Hex(password);
          if (action === 'register') {
            const id = crypto.randomUUID();
            try {
              await env.COMMUNITY_DB.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)").bind(id, username, passHash).run();
              return jsonResp({ ok: true, user: { id, username, passHash, role: 'user', level: 1, xp: 0 } });
            } catch (err) {
              const msg = err && err.message ? String(err.message) : String(err);
              if (msg.includes('UNIQUE')) {
                return jsonResp({ ok: false, msg: '该用户名已被注册' });
              }
              return jsonResp({ ok: false, msg: '注册异常: ' + msg });
            }
          }
          if (action === 'login') {
            const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(username, passHash).first();
            if (!user) return jsonResp({ ok: false, msg: '用户名或密码错误' }, 401);
            if (user.is_banned) return jsonResp({ ok: false, msg: '账号已被封禁' }, 403);
            const normalizedUser = withCommunityLevel(withCommunityRole(user, env));
            return jsonResp({ ok: true, user: { id: normalizedUser.id, username, passHash, role: normalizedUser.role, level: normalizedUser.level, xp: normalizedUser.xp, signature: normalizedUser.signature, avatar_url: normalizedUser.avatar_url, background_url: normalizedUser.background_url } });
          }
        } catch (e) {
          return jsonResp({ ok: false, msg: '服务端错误: ' + e.message }, 500);
        }
      }

      if (url.pathname === '/api/community/link-preview' && request.method === 'GET') {
        try {
          const rawUrl = url.searchParams.get('url') || '';
          if (!rawUrl) return jsonResp({ ok: false, msg: '缺少链接' }, 400);
          const target = new URL(rawUrl);
          if (!['http:', 'https:'].includes(target.protocol)) return jsonResp({ ok: false, msg: '链接协议不支持' }, 400);
          if (isPrivatePreviewHost(target.hostname)) return jsonResp({ ok: false, msg: '该链接不允许预览' }, 400);
          if (isYouTubeHost(target.hostname)) {
            const youtubePreview = await fetchYouTubePreview(target.toString());
            if (youtubePreview) {
              return jsonResp({ ok: true, preview: youtubePreview });
            }
          }
          if (/(^|\.)bilibili\.com$/i.test(target.hostname) || target.hostname === 'b23.tv') {
            const bilibiliPreview = await fetchBilibiliPreview(target.toString());
            if (bilibiliPreview) {
              return jsonResp({ ok: true, preview: bilibiliPreview });
            }
          }
          let fallbackPreview = buildFallbackPreview(target.toString());

          const resp = await fetchWithTimeout(target.toString(), {
            redirect: 'follow',
            headers: getPreviewFetchHeaders()
          });
          if (!resp.ok) {
            return jsonResp({
              ok: true,
              preview: buildFallbackPreview(target.toString(), '站点拒绝返回预览内容')
            });
          }
          const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
          const contentLength = Number(resp.headers.get('content-length') || 0);
          if (contentLength && contentLength > LINK_PREVIEW_MAX_BYTES) {
            return jsonResp({
              ok: true,
              preview: buildFallbackPreview(target.toString(), '链接内容过大，已改为基础卡片')
            });
          }
          if (contentType && !/(text\/html|application\/xhtml\+xml)/.test(contentType)) {
            return jsonResp({
              ok: true,
              preview: buildFallbackPreview(target.toString(), '该链接类型不支持抓取网页信息')
            });
          }

          const finalUrl = resp.url || target.toString();
          const final = new URL(finalUrl);
          if (isPrivatePreviewHost(final.hostname)) return jsonResp({ ok: false, msg: '该链接不允许预览' }, 400);
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
          const description = extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description', 'name') || extractMetaTag(html, 'twitter:description', 'name');

          return jsonResp({
            ok: true,
            preview: {
              url: finalUrl,
              title: title || fallbackPreview.title,
              image,
              description: String(description || '').trim() || fallbackPreview.description,
              host: final.hostname.replace(/^www\./, '')
            }
          });
        } catch (e) {
          if (isAbortLikeError(e) || isPreviewTooLargeError(e)) {
            const rawUrl = url.searchParams.get('url') || '';
            return jsonResp({
              ok: true,
              preview: buildFallbackPreview(rawUrl, isPreviewTooLargeError(e) ? '链接内容过大，已改为基础卡片' : '链接解析超时，已改为基础卡片')
            });
          }
          const rawUrl = url.searchParams.get('url') || '';
          return jsonResp({
            ok: true,
            preview: buildFallbackPreview(rawUrl, '暂时无法抓取站点信息')
          });
        }
      }

      if (url.pathname === '/api/community/posts') {
        if (request.method === 'GET') {
          try {
            const viewer = await getAuth();
            const query = url.searchParams.get('q');
            const userId = url.searchParams.get('userId');
            const username = url.searchParams.get('username');
            let sql = `
              SELECT p.*, u.username, u.avatar_url, COALESCE(u.xp, 0) as xp, COALESCE(u.level, 1) as level, COALESCE(u.role, 'user') as role,
              (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
              (SELECT COUNT(*) FROM posts WHERE repost_id = p.id) as repost_count
              FROM posts p JOIN users u ON p.user_id = u.id 
            `;
            const params = [];
            const postId = url.searchParams.get('id');
            if (postId) {
              sql += " WHERE p.id = ? ";
              params.push(postId);
            } else if (query) {
              sql += " WHERE p.content LIKE ? OR p.content LIKE ? OR u.id LIKE ? ";
              params.push(`%${query}%`, `%#${query}%`, `%${query}%`);
            } else if (userId) {
              sql += " WHERE p.user_id = ? ";
              params.push(userId);
            } else if (username) {
              sql += " WHERE u.username = ? ";
              params.push(username);
            }
            sql += " ORDER BY p.created_at DESC LIMIT 100 ";
            const { results } = await env.COMMUNITY_DB.prepare(sql).bind(...params).all();

            const posts = results || [];
            posts.forEach(p => {
              const normalizedPostUser = withCommunityLevel({ role: normalizeCommunityRole(p, env), xp: p.xp, level: p.level });
              p.role = normalizedPostUser.role;
              p.level = normalizedPostUser.level;
              p.xp = normalizedPostUser.xp;
              try {
                const parsedMedia = JSON.parse(p.media_json || '[]');
                p.media_json = JSON.stringify(Array.isArray(parsedMedia) ? parsedMedia.filter(item => item && typeof item === 'object') : []);
              } catch (e) {
                p.media_json = '[]';
              }
            });
            if (posts.length > 0) {
              const ids = posts.map(p => p.id);
              const placeholders = ids.map(() => '?').join(',');
              // Fetch latest 3 comments for each post (sqlite doesn't have row_number easily, so we just fetch all and group in JS, limit 500 total comments to prevent memory bloat)
              const commQuery = "SELECT c.id, c.post_id, c.content, c.user_id, u.username, u.avatar_url, COALESCE(u.xp, 0) as xp, COALESCE(u.level, 1) as level FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id IN (" + placeholders + ") ORDER BY c.created_at ASC LIMIT 500";
              const commResults = await env.COMMUNITY_DB.prepare(commQuery).bind(...ids).all();
              const comms = (commResults.results || []).map(comment => {
                const normalizedCommentUser = withCommunityLevel(comment);
                return {
                  ...comment,
                  level: normalizedCommentUser.level,
                  xp: normalizedCommentUser.xp
                };
              });
              let likedIds = new Set();

              if (viewer) {
                const likedResults = await env.COMMUNITY_DB.prepare(
                  "SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (" + placeholders + ")"
                ).bind(viewer.id, ...ids).all();
                likedIds = new Set((likedResults.results || []).map(row => row.post_id));
              }
              
              posts.forEach(p => {
                p.inline_comments = comms.filter(c => c.post_id === p.id).slice(-3); // Get last 3 comments
                p.viewer_liked = likedIds.has(p.id);
              });
            }

            return jsonResp({ ok: true, posts });
          } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
        }
        if (request.method === 'POST') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
          const { content, media, repost_id } = await request.json();
          const postId = crypto.randomUUID();
          await env.COMMUNITY_DB.prepare("INSERT INTO posts (id, user_id, content, media_json, type, repost_id) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(postId, user.id, content || '', JSON.stringify(media || []), repost_id ? 'repost' : 'post', repost_id || null).run();
          
          await awardXP(user.id, 5);
          if (repost_id) {
            const original = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(repost_id).first();
            if (original) await addNotify(original.user_id, 'repost', user.id, postId);
          }
          return jsonResp({ ok: true });
        }
        if (request.method === 'DELETE') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
          const postId = url.searchParams.get('id');
          const post = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(postId).first();
          if (!post) return jsonResp({ ok: false, msg: 'Not found' }, 404);
          if (post.user_id !== user.id && !isCommunityAdminRole(user.role)) return jsonResp({ ok: false, msg: 'Forbidden' }, 403);
          await env.COMMUNITY_DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();
          return jsonResp({ ok: true });
        }
      }

      if (url.pathname === '/api/community/like' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const { post_id } = await request.json();
        const post = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(post_id).first();
        if (!post) return jsonResp({ ok: false }, 404);
        try {
          await env.COMMUNITY_DB.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)").bind(post_id, user.id).run();
          await awardXP(user.id, 1);
          await addNotify(post.user_id, 'like', user.id, post_id);
          return jsonResp({ ok: true, action: 'liked' });
        } catch (e) {
          await env.COMMUNITY_DB.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?").bind(post_id, user.id).run();
          return jsonResp({ ok: true, action: 'unliked' });
        }
      }

      if (url.pathname === '/api/community/follow' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const { following_id } = await request.json();
        try {
          await env.COMMUNITY_DB.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)").bind(user.id, following_id).run();
          await addNotify(following_id, 'follow', user.id, null);
          return jsonResp({ ok: true, action: 'followed' });
        } catch (e) {
          await env.COMMUNITY_DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, following_id).run();
          return jsonResp({ ok: true, action: 'unfollowed' });
        }
      }

      if (url.pathname === '/api/community/notifications' && request.method === 'GET') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false }, 401);
        const { results } = await env.COMMUNITY_DB.prepare(`
          SELECT n.*, u.id as user_id, u.username, u.avatar_url FROM notifications n 
          JOIN users u ON n.from_user_id = u.id 
          WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50
        `).bind(user.id).all();
        return jsonResp({ ok: true, notifications: results || [] });
      }

      
      if (url.pathname === '/api/community/profile' && request.method === 'GET') {
        const viewer = await getAuth();
        const uid = url.searchParams.get('id');
        const uname = url.searchParams.get('username');
        let sql = "SELECT id, username, avatar_url, background_url, signature, level, xp, role FROM users WHERE ";
        let param = uid;
        if (uid) { sql += "id = ?"; } else { sql += "username = ?"; param = uname; }
        const user = await env.COMMUNITY_DB.prepare(sql).bind(param).first();
        if (!user) return jsonResp({ ok: false }, 404);
        user.role = normalizeCommunityRole(user, env);
        user.level = getCommunityLevelFromXp(user.xp);
        
        const followers = await env.COMMUNITY_DB.prepare("SELECT COUNT(*) as c FROM follows WHERE following_id = ?").bind(user.id).first();
        const following = await env.COMMUNITY_DB.prepare("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?").bind(user.id).first();
        user.followers_count = followers ? followers.c : 0;
        user.following_count = following ? following.c : 0;
        user.viewer_is_following = false;

        if (viewer && viewer.id !== user.id) {
          const relation = await env.COMMUNITY_DB.prepare(
            "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
          ).bind(viewer.id, user.id).first();
          user.viewer_is_following = !!relation;
        }
        
        return jsonResp({ ok: true, user });
      }
      
      if (url.pathname === '/api/community/profile' && request.method === 'POST') {

        const user = await getAuth();
        if (!user) return jsonResp({ ok: false }, 401);
        const { signature, background_url, avatar_url } = await request.json();
        await env.COMMUNITY_DB.prepare("UPDATE users SET signature = ?, background_url = ?, avatar_url = ? WHERE id = ?")
          .bind(signature || user.signature, background_url || user.background_url, avatar_url || user.avatar_url, user.id).run();
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/comments') {
        if (request.method === 'GET') {
          const postId = url.searchParams.get('postId');
          const { results } = await env.COMMUNITY_DB.prepare(`
            SELECT c.*, u.id as user_id, u.username, u.avatar_url, COALESCE(u.xp, 0) as xp, COALESCE(u.level, 1) as level FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.post_id = ? ORDER BY c.created_at ASC
          `).bind(postId).all();
          const comments = (results || []).map(comment => withCommunityLevel(comment));
          return jsonResp({ ok: true, comments });
        }
        if (request.method === 'POST') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false }, 401);
          const { post_id, content, parent_id } = await request.json();
          const commentId = crypto.randomUUID();
          await env.COMMUNITY_DB.prepare("INSERT INTO comments (id, post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)")
            .bind(commentId, post_id, user.id, parent_id || null, content).run();
          await awardXP(user.id, 2);
          const post = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(post_id).first();
          if (post) await addNotify(post.user_id, 'comment', user.id, post_id);
          return jsonResp({ ok: true });
        }
      }

      if (url.pathname === '/api/community/report' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false }, 401);
        const { target_type, target_id, reason } = await request.json();
        await env.COMMUNITY_DB.prepare("INSERT INTO reports (id, user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), user.id, target_type, target_id, reason).run();
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/admin/data' && request.method === 'GET') {
        const user = await getAuth();
        if (!user || !isCommunityAdminRole(user.role)) return jsonResp({ ok: false }, 403);
        const reports = await env.COMMUNITY_DB.prepare("SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at DESC").all();
        await ensureDriveSchema(env);
        const users = await env.COMMUNITY_DB.prepare("SELECT u.id, u.username, u.role, u.level, u.xp, u.is_banned, u.created_at, u.avatar_url, u.password_hash, COALESCE(ds.quota_bytes, 0) as drive_quota, COALESCE(ds.used_bytes, 0) as drive_used FROM users u LEFT JOIN user_drive_stats ds ON u.id = ds.user_id ORDER BY u.created_at DESC").all();
        const normalizedUsers = (users.results || []).map(row => ({
          ...withCommunityLevel(row),
          role: normalizeCommunityRole(row, env)
        }));
        const announcementRaw = await env.SCHEDULE_KV.get('community_announcement');
        const announcement = announcementRaw ? JSON.parse(announcementRaw) : { content: '', updatedAt: null };
        return jsonResp({ ok: true, reports: reports.results || [], users: normalizedUsers, announcement });
      }

      if (url.pathname === '/api/community/announcement' && request.method === 'GET') {
        const announcementRaw = await env.SCHEDULE_KV.get('community_announcement');
        const announcement = announcementRaw ? JSON.parse(announcementRaw) : { content: '', updatedAt: null };
        return jsonResp({ ok: true, announcement });
      }

      
      if (url.pathname === '/api/community/admin/action' && request.method === 'POST') {
        const user = await getAuth();
        if (!user || !isCommunityAdminRole(user.role)) return jsonResp({ ok: false }, 403);
        const { action, target_type, target_id, report_id, new_password, content } = await request.json();
        const targetUser = target_type === 'user' && target_id
          ? withCommunityRole(await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE id = ?").bind(target_id).first(), env)
          : null;
        const actorIsOwner = isCommunityOwnerRole(user.role);
        const targetIsPrivileged = isCommunityAdminRole(targetUser?.role);
        const targetIsOwner = isCommunityOwnerRole(targetUser?.role);
        
        if (action === 'reset_password' && target_type === 'user') {
           if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);
           if (targetIsOwner) return jsonResp({ ok: false, msg: '不能重置 owner 账号密码' }, 403);
           if (targetIsPrivileged && !actorIsOwner) return jsonResp({ ok: false, msg: '只有 owner 可以重置管理员密码' }, 403);
           const passHash = await sha256Hex(new_password);
           await env.COMMUNITY_DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passHash, target_id).run();
           return jsonResp({ ok: true });
        }

        if (action === 'set_drive_quota' && target_type === 'user') {
           if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);
           await ensureDriveSchema(env);
           const { quota_gb } = await request.json();
           const quotaBytes = Number(quota_gb) * 1024 * 1024 * 1024;
           await env.COMMUNITY_DB.prepare("INSERT INTO user_drive_stats (user_id, quota_bytes, used_bytes) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET quota_bytes = excluded.quota_bytes").bind(target_id, quotaBytes).run();
           return jsonResp({ ok: true });
        }

        if (action === 'delete_item') {
          if (target_type === 'post') await env.COMMUNITY_DB.prepare("DELETE FROM posts WHERE id = ?").bind(target_id).run();
          if (target_type === 'comment') await env.COMMUNITY_DB.prepare("DELETE FROM comments WHERE id = ?").bind(target_id).run();
          if (report_id) await env.COMMUNITY_DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(report_id).run();
        } else if (action === 'resolve_report') {
          await env.COMMUNITY_DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(target_id).run();
        } else if (action === 'ban_user') {
          if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);
          if (targetIsPrivileged) return jsonResp({ ok: false, msg: '不能封禁管理员账号' }, 403);
          await env.COMMUNITY_DB.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").bind(target_id).run();
        } else if (action === 'unban_user') {
          if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);
          if (targetIsPrivileged) return jsonResp({ ok: false, msg: '不能操作管理员账号' }, 403);
          await env.COMMUNITY_DB.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").bind(target_id).run();
        } else if (action === 'grant_admin' && target_type === 'user') {
          if (!actorIsOwner) return jsonResp({ ok: false, msg: '只有 owner 可以授权管理员' }, 403);
          if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);
          if (targetIsPrivileged) return jsonResp({ ok: false, msg: '该用户已是管理员' }, 400);
          await env.COMMUNITY_DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(target_id).run();
        } else if (action === 'revoke_admin' && target_type === 'user') {
          if (!actorIsOwner) return jsonResp({ ok: false, msg: '只有 owner 可以撤销管理员' }, 403);
          if (!targetUser) return jsonResp({ ok: false, msg: '用户不存在' }, 404);
          if (target_id === user.id) return jsonResp({ ok: false, msg: '不能撤销自己的管理员权限' }, 400);
          if (targetIsOwner) return jsonResp({ ok: false, msg: '不能撤销 owner 权限' }, 403);
          await env.COMMUNITY_DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(target_id).run();
        } else if (action === 'set_announcement') {
          await env.SCHEDULE_KV.put('community_announcement', JSON.stringify({
            content: String(content || '').trim(),
            updatedAt: new Date().toISOString()
          }));
        }
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/upload' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const buffer = await request.arrayBuffer();
        const contentType = request.headers.get('content-type') || 'image/jpeg';
        try {
          // 核心逻辑：确保 Drive 成功即发布成功
          const driveData = await uploadToDrive(env, buffer, `img_${Date.now()}`, contentType);
          const fileId = driveData.id;

          // R2 只做有上限的图片缓存，不做全量永久主存储。
          if (canCacheCommunityMedia(contentType, buffer.byteLength, env)) {
            ctx.waitUntil(
              cacheCommunityMedia(env, fileId, buffer, contentType, 'upload')
                .catch(e => console.error('R2 Background Cache Error:', e))
            );
          }

          return jsonResp({
            ok: true,
            fileId,
            url: `/api/community/media/${fileId}`,
            fromDrive: true,
            cachedToR2: canCacheCommunityMedia(contentType, buffer.byteLength, env)
          });
        } catch (e) { 
          return jsonResp({ ok: false, msg: "Drive 发布失败: " + e.message }, 500); 
        }
      }

      if (url.pathname.startsWith('/api/community/media/')) {
        const fileId = url.pathname.split('/').pop();
        
        // 1. 优先读取 R2 缓存
        if (env.COMMUNITY_R2) {
          try {
            const cache = await env.COMMUNITY_R2.get(fileId);
            if (cache) {
              ctx.waitUntil(touchCommunityCacheEntry(env, fileId).catch(() => {}));
              return new Response(cache.body, { 
                headers: { 
                  'Access-Control-Allow-Origin': '*', 
                  'Content-Type': cache.httpMetadata.contentType || 'image/jpeg',
                  'X-Cache': 'HIT-R2',
                  'Cache-Control': 'public, max-age=31536000'
                } 
              });
            }
          } catch (e) {}
        }

        // 2. 缓存未命中，从 Drive 读取
        try {
          const drive = await getFromDrive(env, fileId);
          if (!drive.ok) throw new Error("Drive file not found");
          const contentType = drive.headers.get('content-type') || 'image/jpeg';
          const buf = await drive.arrayBuffer();

          // 3. 只把合适的小图回填到 R2。
          if (canCacheCommunityMedia(contentType, buf.byteLength, env)) {
            ctx.waitUntil(
              cacheCommunityMedia(env, fileId, buf, contentType, 'drive-backfill')
                .catch(e => console.error('R2 Backfill Error:', e))
            );
          }

          return new Response(buf, { 
            headers: { 
              'Access-Control-Allow-Origin': '*', 
              'Content-Type': contentType, 
              'X-Cache': 'MISS-GDrive',
              'Cache-Control': 'public, max-age=31536000'
            } 
          });
        } catch (e) { return new Response('Media Not Found', { status: 404 }); }
      }

      if (url.pathname === '/api/community/media-cache-stats' && request.method === 'GET') {
        const user = await getAuth();
        if (!user || !isCommunityAdminRole(user.role)) return jsonResp({ ok: false }, 403);
        const summary = await getCommunityCacheSummary(env);
        const config = getCommunityCacheConfig(env);
        return jsonResp({
          ok: true,
          summary,
          config,
          usagePercent: config.maxBytes ? Number(((Number(summary.totalBytes || 0) / config.maxBytes) * 100).toFixed(2)) : 0
        });
      }

      if (url.pathname === '/api/community/media-cache-warm' && request.method === 'POST') {
        const user = await getAuth();
        if (!user || !isCommunityAdminRole(user.role)) return jsonResp({ ok: false }, 403);
        const body = await request.json().catch(() => ({}));
        const limit = Math.max(1, Math.min(80, Number(body.limit || 24)));
        const fileIds = await collectRecentCommunityMediaFileIds(env, limit);
        const stats = {
          requested: limit,
          selected: fileIds.length,
          hit: 0,
          cached: 0,
          skipped: 0,
          missing: 0,
          failed: 0
        };

        for (const fileId of fileIds) {
          try {
            const result = await preheatCommunityMediaFile(env, fileId);
            if (result.status === 'hit') stats.hit += 1;
            else if (result.status === 'cached') stats.cached += 1;
            else if (result.status === 'skipped') stats.skipped += 1;
            else if (result.status === 'missing') stats.missing += 1;
            else stats.failed += 1;
          } catch (e) {
            stats.failed += 1;
          }
        }

        const summary = await getCommunityCacheSummary(env);
        const config = getCommunityCacheConfig(env);
        return jsonResp({
          ok: true,
          stats,
          summary,
          config,
          usagePercent: config.maxBytes ? Number(((Number(summary.totalBytes || 0) / config.maxBytes) * 100).toFixed(2)) : 0
        });
      }

      if (url.pathname === '/api/community/test-drive') {
        try {
          const token = await getGoogleAuthToken(env);
          const drive = await (await fetch(`https://www.googleapis.com/drive/v3/files/${env.GDRIVE_FOLDER_ID}?supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } })).json();
          return jsonResp({ ok: true, msg: '[V4-OAuth2] 诊断完成', folder: drive.name });
        } catch (e) { return jsonResp({ ok: false, err: e.message }); }
      }
    }

    if (url.pathname.startsWith('/chess/') || url.pathname.match(/\.(js|css|png|jpg|ico)$/)) return env.ASSETS.fetch(request);
    return new Response(htmlContent, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    };
