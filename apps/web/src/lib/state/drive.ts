import { communityFetch, readStoredCommunitySession } from '$lib/api/communityAuth';

export type DriveItem = {
  id: string;
  name: string;
  size?: number;
  mime_type?: string;
  url?: string;
  parent_id?: string | null;
  is_folder?: boolean | number;
  updated_at?: string;
  preview_status?: DrivePreviewStatus;
  previewable?: boolean;
};

export type DriveStats = {
  quota_bytes?: number;
  used_bytes?: number;
  available_bytes?: number;
};

export type DrivePathCrumb = {
  id: string | null;
  name: string;
};

export type DriveFeedbackTone = 'success' | 'error' | 'info';
export type DriveDialogMode = 'create' | 'rename' | 'delete';
export type DrivePreviewStatus = 'ready' | 'loading' | 'error';

export type DriveFeedback = {
  text: string;
  tone: DriveFeedbackTone;
};

export const rootDrivePath: DrivePathCrumb[] = [{ id: null, name: '根目录' }];

export function isCommunitySessionReady() {
  return Boolean(readStoredCommunitySession());
}

export function normalizeDriveStats(stats: DriveStats = {}) {
  const quota = Math.max(0, Number(stats.quota_bytes || 0));
  const used = Math.max(0, Number(stats.used_bytes || 0));
  const available = typeof stats.available_bytes === 'number'
    ? Math.max(0, Number(stats.available_bytes || 0))
    : Math.max(0, quota - used);

  return {
    quota_bytes: quota,
    used_bytes: used,
    available_bytes: available
  } satisfies DriveStats;
}

export function isFolder(item: DriveItem) {
  return Boolean(item.is_folder);
}

export function isImage(item: DriveItem) {
  return String(item.mime_type || '').toLowerCase().startsWith('image/');
}

export function isMedia(item: DriveItem) {
  const mime = String(item.mime_type || '').toLowerCase();
  return mime.startsWith('audio/') || mime.startsWith('video/') || isImage(item);
}

export function describeDriveItem(item: DriveItem) {
  if (isFolder(item)) return '文件夹';
  const mime = String(item.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return '图片';
  if (mime.startsWith('audio/')) return '音频';
  if (mime.startsWith('video/')) return '视频';
  return item.mime_type || '文件';
}

export function getDriveItemOpenLabel(item: DriveItem) {
  if (isFolder(item)) return '打开';
  const mime = String(item.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return '查看图片';
  if (mime.startsWith('audio/')) return '播放音频';
  if (mime.startsWith('video/')) return '播放视频';
  return '打开文件';
}

export function mapDriveItems(files: DriveItem[] = []): DriveItem[] {
  return files.map((item) => ({
    ...item,
    preview_status: isFolder(item) || !isMedia(item) || !isImage(item) ? 'ready' : 'loading'
  }));
}

export function formatDriveBytes(value = 0) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export async function fetchDriveInfo() {
  const res = await communityFetch('/api/community/drive/info');
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.msg || '网盘信息没加载出来。');
  }
  return normalizeDriveStats(data.stats);
}

export async function fetchDriveList(parentId: string | null = null) {
  const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
  const res = await communityFetch(`/api/community/drive/list${query}`);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.msg || '这个目录没加载出来。');
  }
  return mapDriveItems(Array.isArray(data.files) ? data.files : []);
}

export async function createDriveFolder(name: string, parentId: string | null = null) {
  const res = await communityFetch('/api/community/drive/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.msg || '文件夹没建成功。');
  }
  return data;
}

export async function renameDriveEntry(id: string, name: string) {
  const res = await communityFetch('/api/community/drive/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.msg || '改名没成功。');
  }
  return data;
}

export async function deleteDriveEntries(ids: string[]) {
  const res = await communityFetch('/api/community/drive/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.msg || '删除没成功。');
  }
  return data;
}

export async function uploadDriveFile(file: File, parentId: string | null = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (parentId) formData.append('parent_id', parentId);

  const res = await communityFetch('/api/community/drive/upload', {
    method: 'POST',
    body: formData
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.msg || '文件没传上去。');
  }
  return data;
}
