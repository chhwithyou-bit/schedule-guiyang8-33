export type MusicTrack = {
  name: string;
  artist: string;
  url: string;
  cover?: string | null;
};

export type MusicObject = {
  key: string;
  contentType?: string | null;
};

export interface MusicBucket {
  get(key: string): Promise<{ json(): Promise<unknown> } | null>;
  put(key: string, value: string): Promise<void>;
  list(): Promise<{ objects?: MusicObject[] }>;
}

const PLAYLIST_KEY = 'playlist.json';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];

function displayNameFromKey(key: string) {
  const fileName = key.split('/').pop() || key;
  return decodeURIComponent(fileName).replace(/\.[^.]+$/, '');
}

function musicUrl(origin: string, key: string) {
  return `${origin.replace(/\/$/, '')}/api/music/file/${encodeURIComponent(key)}`;
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

export function mergeMusicPlaylist(origin: string, storedList: unknown, objects: MusicObject[] = []): MusicTrack[] {
  const seeded = Array.isArray(storedList)
    ? (storedList.map((item) => normalizeTrack(item)).filter(Boolean) as MusicTrack[])
    : [];

  const existingUrls = new Set(seeded.map((track) => track.url));
  const discovered = objects
    .filter((object) => AUDIO_EXTENSIONS.some((ext) => object.key.toLowerCase().endsWith(ext)))
    .map((object) => ({
      name: displayNameFromKey(object.key),
      artist: '未知歌手',
      url: musicUrl(origin, object.key),
      cover: null
    }))
    .filter((track) => !existingUrls.has(track.url));

  return [...seeded, ...discovered];
}

export async function readMusicPlaylist(bucket: MusicBucket, origin: string): Promise<MusicTrack[]> {
  const playlistObject = await bucket.get(PLAYLIST_KEY);
  const storedList = playlistObject ? await playlistObject.json() : [];
  const listed = await bucket.list();
  return mergeMusicPlaylist(origin, storedList, listed.objects || []);
}

export async function writeMusicPlaylist(bucket: MusicBucket, list: MusicTrack[]): Promise<void> {
  await bucket.put(PLAYLIST_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}
