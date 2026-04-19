export type StorageBackend = 'gdrive' | 'r2-cache';

export type StorageObjectRecord = {
  key: string;
  url: string;
  size: number;
  contentType: string;
  fileName: string;
  backend: StorageBackend;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type DriveEntryRecord = {
  id: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  parentId: string | null;
  isFolder: boolean;
  backend: StorageBackend;
  storageKey?: string;
  legacyFileId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DriveStatsRecord = {
  quotaBytes: number;
  usedBytes: number;
  availableBytes: number;
};

export type UploadInput = {
  userId: string;
  fileName: string;
  contentType: string;
  size: number;
  bytes: ArrayBuffer | Uint8Array;
  parentId?: string | null;
  now?: Date;
};

export type UploadResult = {
  id: string;
  fileId: string;
  url: string;
  backend: StorageBackend;
  file: DriveEntryRecord;
  stats?: DriveStatsRecord;
  cacheStatus?: 'cached' | 'skipped';
};

export type MediaReadResult = {
  ok: boolean;
  status: number;
  backend?: StorageBackend;
  contentType?: string;
  bytes?: ArrayBuffer;
  cacheStatus?: string;
};

export type R2LikeBucket = {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  get(key: string): Promise<{ body?: ArrayBuffer; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

export type GoogleDriveLike = {
  upload(input: { fileName: string; contentType: string; bytes: ArrayBuffer | Uint8Array }): Promise<{ fileId: string }>;
  read(fileId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null>;
};

export type DriveRepository = {
  list(input: { userId: string; parentId?: string | null }): Promise<DriveEntryRecord[]>;
  getById(input: { userId: string; id: string }): Promise<DriveEntryRecord | null>;
  getByIds(input: { userId: string; ids: string[] }): Promise<DriveEntryRecord[]>;
  getStats(userId: string): Promise<DriveStatsRecord>;
  ensureStats(userId: string): Promise<DriveStatsRecord>;
  save(entry: DriveEntryRecord): Promise<void>;
  rename(input: { userId: string; id: string; name: string }): Promise<DriveEntryRecord | null>;
  remove(input: { userId: string; ids: string[] }): Promise<{ deleted: DriveEntryRecord[]; stats: DriveStatsRecord }>;
  createFolder(entry: DriveEntryRecord): Promise<void>;
  updateStats(userId: string, sizeDelta: number): Promise<DriveStatsRecord>;
};

export type CommunityStorageEnv = {
  publicMediaBasePath?: string;
  r2?: R2LikeBucket | null;
  googleDrive?: GoogleDriveLike | null;
  driveRepo: DriveRepository;
  maxUploadBytes?: number;
};
