export type MusicTrack = {
  name: string;
  artist: string;
  url: string;
  cover?: string | null;
};

export type MusicObject = {
  key: string;
  contentType?: string | null;
  httpMetadata?: {
    contentType?: string | null;
  } | null;
  body?: ReadableStream | ArrayBuffer | Blob | null;
};

export interface MusicBucket {
  get(key: string): Promise<MusicObjectWithJson | null>;
  put(key: string, value: string): Promise<void>;
  list(): Promise<{ objects?: MusicObject[] }>;
}

export type MusicObjectWithJson = MusicObject & {
  json(): Promise<unknown>;
};

export type MusicAdminVerifier = (username: string, password: string) => Promise<boolean>;

const PLAYLIST_KEY = 'playlist.json';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.oga', '.webm'];
const LEGACY_MUSIC_HOSTS = ['thefallback.cc.cd', 'www.thefallback.cc.cd', 'media.thefallback.cc.cd'];

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeObjectKey(key: string) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(safeDecodeURIComponent(part)))
    .join('/');
}

function displayNameFromKey(key: string) {
  const fileName = key.split('/').pop() || key;
  return safeDecodeURIComponent(fileName).replace(/\.[^.]+$/, '');
}

function musicUrl(origin: string, key: string) {
  const encodedKey = encodeObjectKey(key);
  return `${origin.replace(/\/$/, '')}/api/music/file/${encodedKey}`;
}

function normalizeTrack(track: unknown): MusicTrack | null {
  if (!track || typeof track !== 'object') return null;
  const candidate = track as Record<string, unknown>;
  const url = String(candidate.url || '').trim();
  if (!url) return null;

  return {
    name: String(candidate.name || '').trim() || '未命名歌曲',
    artist: String(candidate.artist || '').trim() || '未知歌手',
    url,
    cover: String(candidate.cover || '').trim() || null
  };
}

function isMusicObjectKey(key: string) {
  return AUDIO_EXTENSIONS.some((ext) => key.toLowerCase().endsWith(ext));
}

export function extractMusicObjectKey(trackUrl: string) {
  const rawUrl = String(trackUrl || '').trim();
  if (!rawUrl) return '';

  try {
    const parsed = new URL(rawUrl);
    const proxyMatch = parsed.pathname.match(/^\/api\/music\/file\/(.+)$/);
    if (proxyMatch) {
      return safeDecodeURIComponent(proxyMatch[1]);
    }
    return safeDecodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    const proxyMatch = rawUrl.match(/^\/?api\/music\/file\/(.+)$/);
    if (proxyMatch) {
      return safeDecodeURIComponent(proxyMatch[1]);
    }
    return safeDecodeURIComponent(rawUrl.replace(/^\/+/, ''));
  }
}

function normalizeTrackUrl(origin: string, host: string, track: MusicTrack): MusicTrack {
  const rawUrl = String(track.url || '').trim();
  if (!rawUrl) return track;

  try {
    const parsed = new URL(rawUrl);
    const legacyHosts = new Set([...LEGACY_MUSIC_HOSTS, host].filter(Boolean));
    if (!legacyHosts.has(parsed.hostname)) {
      return track;
    }

    const objectKey = extractMusicObjectKey(parsed.toString());
    if (!objectKey || objectKey === PLAYLIST_KEY) return track;
    return { ...track, url: musicUrl(origin, objectKey) };
  } catch {
    const objectKey = extractMusicObjectKey(rawUrl);
    if (!objectKey || objectKey === PLAYLIST_KEY) return track;
    return { ...track, url: musicUrl(origin, objectKey) };
  }
}

export function mergeMusicPlaylist(origin: string, storedList: unknown, objects: MusicObject[] = [], host = ''): MusicTrack[] {
  const seeded = Array.isArray(storedList)
    ? (storedList.map((item) => normalizeTrack(item)).filter(Boolean) as MusicTrack[])
    : [];

  const savedByKey = new Map<string, MusicTrack>();
  const savedOrder = new Map<string, number>();
  const externalTracks: MusicTrack[] = [];

  seeded.forEach((track, index) => {
    const objectKey = extractMusicObjectKey(track.url);
    if (!objectKey || objectKey === PLAYLIST_KEY) {
      externalTracks.push(normalizeTrackUrl(origin, host, track));
      return;
    }

    if (!savedByKey.has(objectKey)) {
      savedByKey.set(objectKey, track);
      savedOrder.set(objectKey, index);
    }
  });

  const mergedBucketTracks = objects
    .filter((object) => isMusicObjectKey(object.key))
    .map((object) => {
      const saved = savedByKey.get(object.key);
      return {
        name: saved?.name || displayNameFromKey(object.key) || '未命名歌曲',
        artist: saved?.artist || '云端歌单',
        url: musicUrl(origin, object.key),
        cover: saved?.cover || null
      } satisfies MusicTrack;
    })
    .sort((a, b) => {
      const aKey = extractMusicObjectKey(a.url);
      const bKey = extractMusicObjectKey(b.url);
      const aOrder = savedOrder.has(aKey) ? (savedOrder.get(aKey) as number) : Number.MAX_SAFE_INTEGER;
      const bOrder = savedOrder.has(bKey) ? (savedOrder.get(bKey) as number) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

  return [...mergedBucketTracks, ...externalTracks];
}

export async function readMusicPlaylist(bucket: MusicBucket, origin: string, host = ''): Promise<MusicTrack[]> {
  const playlistObject = await bucket.get(PLAYLIST_KEY);
  const storedList = playlistObject ? await playlistObject.json() : [];
  const listed = await bucket.list();
  return mergeMusicPlaylist(origin, storedList, listed.objects || [], host);
}

export async function writeMusicPlaylist(bucket: MusicBucket, list: MusicTrack[]): Promise<void> {
  await bucket.put(PLAYLIST_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

export async function serveMusicFile(bucket: MusicBucket, objectKey: string): Promise<Response> {
  const normalizedKey = safeDecodeURIComponent(String(objectKey || '').trim());
  if (!normalizedKey) {
    return Response.json({ ok: false, msg: 'Missing music object key' }, { status: 400 });
  }

  const object = await bucket.get(normalizedKey);
  if (!object?.body) {
    return Response.json({ ok: false, msg: '找不到这首歌' }, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
      'Content-Type': object.httpMetadata?.contentType || object.contentType || 'audio/mpeg'
    }
  });
}

export async function handleMusicUpdate(
  bucket: MusicBucket,
  verifyAdmin: MusicAdminVerifier,
  body: unknown
): Promise<{ ok: true } | { ok: false; msg: string; status: number }> {
  const candidate = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const adminUser = String(candidate.adminUser || '');
  const adminPass = String(candidate.adminPass || '');

  if (!(await verifyAdmin(adminUser, adminPass))) {
    return { ok: false, msg: '认证失败', status: 401 };
  }

  if (candidate.action !== 'setList') {
    return { ok: false, msg: '未知操作', status: 400 };
  }

  await writeMusicPlaylist(bucket, Array.isArray(candidate.list) ? (candidate.list as MusicTrack[]) : []);
  return { ok: true };
}
