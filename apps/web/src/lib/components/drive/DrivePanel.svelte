<script lang="ts" context="module">
  export type DriveItem = {
    id: string;
    name: string;
    size?: number;
    mime_type?: string;
    url?: string;
    parent_id?: string | null;
    is_folder?: boolean | number;
    updated_at?: string;
    preview_status?: 'ready' | 'loading' | 'error';
  };

  export type DriveStats = {
    quota_bytes?: number;
    used_bytes?: number;
    available_bytes?: number;
  };
</script>

<script lang="ts">
  export let items: DriveItem[] = [];
  export let stats: DriveStats = { quota_bytes: 0, used_bytes: 0, available_bytes: 0 };
  export let path: Array<{ id: string | null; name: string }> = [{ id: null, name: '根目录' }];
  export let loading = false;
  export let uploading = false;
  export let error = '';
  export let feedback = '';

  export let onNavigate: (index: number) => void = () => {};
  export let onOpen: (item: DriveItem) => void = () => {};
  export let onRename: (item: DriveItem) => void = () => {};
  export let onDelete: (item: DriveItem) => void = () => {};
  export let onRefresh: () => void = () => {};
  export let onCreateFolder: () => void = () => {};
  export let onUpload: (file: File) => void = () => {};

  function formatBytes(value = 0) {
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

  function isFolder(item: DriveItem) {
    return Boolean(item.is_folder);
  }

  function isImage(item: DriveItem) {
    return String(item.mime_type || '').toLowerCase().startsWith('image/');
  }

  function isMedia(item: DriveItem) {
    const mime = String(item.mime_type || '').toLowerCase();
    return mime.startsWith('audio/') || mime.startsWith('video/') || isImage(item);
  }

  function describe(item: DriveItem) {
    if (isFolder(item)) return '文件夹';
    const mime = String(item.mime_type || '').toLowerCase();
    if (mime.startsWith('image/')) return '图片';
    if (mime.startsWith('audio/')) return '音频';
    if (mime.startsWith('video/')) return '视频';
    return item.mime_type || '文件';
  }

  function getOpenLabel(item: DriveItem) {
    if (isFolder(item)) return '打开';
    const mime = String(item.mime_type || '').toLowerCase();
    if (mime.startsWith('image/')) return '查看图片';
    if (mime.startsWith('audio/')) return '播放音频';
    if (mime.startsWith('video/')) return '播放视频';
    return '打开文件';
  }

  $: usagePercent = stats.quota_bytes ? Math.min(100, Math.round(((stats.used_bytes || 0) / stats.quota_bytes) * 100)) : 0;

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onUpload(file);
    input.value = '';
  }
</script>

<section class="drive-panel">
  <header class="drive-panel__hero">
    <div>
      <p class="drive-panel__eyebrow">drive</p>
      <h2>文件与网盘空间</h2>
      <p>上传、媒体读取、文件夹整理统一走同一套领域接口，Google Drive 为主存储，R2 只做缓存。</p>
    </div>

    <div class="drive-panel__actions">
      <label>
        {uploading ? '上传中…' : '上传文件'}
        <input type="file" on:change={handleFileChange} disabled={uploading} />
      </label>
      <button type="button" on:click={onCreateFolder}>新建文件夹</button>
      <button type="button" on:click={onRefresh}>刷新</button>
    </div>
  </header>

  <div class="drive-panel__meter" aria-label="网盘容量使用情况">
    <div class="drive-panel__meter-bar" style={`width:${usagePercent}%`}></div>
  </div>
  <p class="drive-panel__stats">{formatBytes(stats.used_bytes || 0)} / {formatBytes(stats.quota_bytes || 0)}，剩余 {formatBytes(stats.available_bytes || 0)}</p>

  <nav class="drive-panel__breadcrumbs" aria-label="当前目录">
    {#each path as crumb, index}
      <button type="button" on:click={() => onNavigate(index)}>{crumb.name}</button>
    {/each}
  </nav>

  {#if feedback}
    <p class="drive-panel__feedback">{feedback}</p>
  {/if}

  {#if error}
    <p class="drive-panel__error">{error}</p>
  {/if}

  <div class="drive-panel__list" aria-busy={loading}>
    {#if loading}
      {#each Array(3) as _}
        <article class="drive-panel__item is-skeleton"></article>
      {/each}
    {:else if items.length > 0}
      {#each items as item (item.id)}
        <article class="drive-panel__item">
          <div class="drive-panel__item-main">
            <div class="drive-panel__thumb" aria-hidden="true">
              {#if isImage(item) && item.url}
                <img src={item.url} alt="" loading="lazy" />
              {:else}
                <span>{isFolder(item) ? 'DIR' : 'FILE'}</span>
              {/if}
            </div>
            <div>
              <h3>{item.name}</h3>
              <p>{describe(item)} {#if !isFolder(item)}· {formatBytes(item.size || 0)}{/if}</p>
              {#if isMedia(item) && !isFolder(item)}
                {#if item.preview_status === 'loading'}<p>媒体预览加载中…</p>{/if}
                {#if item.preview_status === 'error'}<p>媒体状态异常，可能无法直接预览。</p>{/if}
                {#if item.preview_status !== 'loading' && item.preview_status !== 'error'}<p>媒体可直接打开预览。</p>{/if}
              {/if}
            </div>
          </div>

          <div class="drive-panel__item-actions">
            {#if isFolder(item)}
              <button type="button" on:click={() => onOpen(item)}>{getOpenLabel(item)}</button>
            {:else if item.url}
              <a href={item.url} target="_blank" rel="noreferrer">{getOpenLabel(item)}</a>
            {/if}
            <button type="button" on:click={() => onRename(item)}>改名</button>
            <button type="button" on:click={() => onDelete(item)}>删除</button>
          </div>
        </article>
      {/each}
    {:else}
      <p class="drive-panel__empty">这个目录还没有文件。</p>
    {/if}
  </div>
</section>

<style>
  .drive-panel { display: grid; gap: 1rem; }
  .drive-panel__hero, .drive-panel__item, .drive-panel__empty { border: 1px solid rgba(255,255,255,.12); border-radius: 1.5rem; padding: 1rem; background: rgba(255,255,255,.05); }
  .drive-panel__eyebrow { font-size: .7rem; letter-spacing: .2em; text-transform: uppercase; opacity: .6; }
  .drive-panel__actions { display: flex; flex-wrap: wrap; gap: .75rem; }
  .drive-panel__actions input { display: none; }
  .drive-panel__actions button, .drive-panel__actions label, .drive-panel__breadcrumbs button, .drive-panel__item-actions button, .drive-panel__item-actions a { cursor: pointer; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: .6rem .95rem; background: rgba(255,255,255,.06); color: inherit; text-decoration: none; }
  .drive-panel__meter { overflow: hidden; height: .75rem; border-radius: 999px; background: rgba(255,255,255,.08); }
  .drive-panel__meter-bar { height: 100%; background: var(--color-primary, #fac7b7); }
  .drive-panel__breadcrumbs, .drive-panel__item-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  .drive-panel__list { display: grid; gap: .75rem; }
  .drive-panel__item { display: flex; gap: 1rem; justify-content: space-between; align-items: center; }
  .drive-panel__item-main { display: flex; gap: .75rem; align-items: center; min-width: 0; }
  .drive-panel__thumb { width: 3rem; height: 3rem; border-radius: 1rem; overflow: hidden; background: rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; flex: none; }
  .drive-panel__thumb img { width: 100%; height: 100%; object-fit: cover; }
  .is-skeleton { min-height: 5rem; opacity: .4; }
</style>
