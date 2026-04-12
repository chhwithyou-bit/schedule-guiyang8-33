<script lang="ts">
  import {
    describeDriveItem,
    formatDriveBytes,
    getDriveItemOpenLabel,
    isFolder,
    isImage,
    isMedia,
    type DriveDialogMode,
    type DriveFeedback,
    type DriveItem,
    type DrivePathCrumb,
    type DrivePreviewStatus,
    type DriveStats
  } from '$lib/state/drive';

  export let items: DriveItem[] = [];
  export let stats: DriveStats = { quota_bytes: 0, used_bytes: 0, available_bytes: 0 };
  export let path: DrivePathCrumb[] = [{ id: null, name: '根目录' }];
  export let loading = false;
  export let uploading = false;
  export let error = '';
  export let feedback: DriveFeedback | null = null;
  export let activeDialog: DriveDialogMode | null = null;
  export let draftName = '';
  export let selectedItem: DriveItem | null = null;
  export let submitDisabled = false;

  export let onPreviewStatusChange: (itemId: string, status: DrivePreviewStatus) => void = () => {};

  export let onNavigate: (index: number) => void = () => {};
  export let onOpen: (item: DriveItem) => void = () => {};
  export let onRefresh: () => void = () => {};
  export let onUpload: (file: File) => void = () => {};
  export let onStartCreateFolder: () => void = () => {};
  export let onStartRename: (item: DriveItem) => void = () => {};
  export let onStartDelete: (item: DriveItem) => void = () => {};
  export let onCancelDialog: () => void = () => {};
  export let onSubmitCreateFolder: () => void = () => {};
  export let onSubmitRename: () => void = () => {};
  export let onSubmitDelete: () => void = () => {};
  export let onDraftNameChange: (value: string) => void = () => {};

  $: usagePercent = stats.quota_bytes ? Math.min(100, Math.round(((stats.used_bytes || 0) / stats.quota_bytes) * 100)) : 0;

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onUpload(file);
    input.value = '';
  }
</script>

<section class="route-shell drive-route" aria-label="网盘与媒体">
  <header class="drive-panel__hero">
    <div>
      <p class="route-kicker">drive</p>
      <h1>文件与网盘空间</h1>
      <p>列表、上传、文件夹整理和媒体状态都直接走 route-native 页面，继续复用现有 worker drive 接口。</p>
    </div>

    <div class="drive-panel__actions">
      <label class="drive-panel__pill">
        {uploading ? '上传中…' : '上传文件'}
        <input type="file" on:change={handleFileChange} disabled={uploading} />
      </label>
      <button class="drive-panel__pill" type="button" on:click={onStartCreateFolder}>新建文件夹</button>
      <button class="drive-panel__pill" type="button" on:click={onRefresh}>刷新</button>
    </div>
  </header>

  <section class="drive-panel__summary" aria-label="网盘容量使用情况">
    <div>
      <p class="drive-panel__summary-label">已占用</p>
      <strong>{formatDriveBytes(stats.used_bytes || 0)} / {formatDriveBytes(stats.quota_bytes || 0)}</strong>
    </div>
    <div>
      <p class="drive-panel__summary-label">剩余可用</p>
      <strong>{formatDriveBytes(stats.available_bytes || 0)}</strong>
    </div>
  </section>

  <div class="drive-panel__meter" aria-hidden="true">
    <div class="drive-panel__meter-bar" style={`width:${usagePercent}%`}></div>
  </div>

  <nav class="drive-panel__breadcrumbs" aria-label="当前目录">
    {#each path as crumb, index}
      <button class:index-active={index === path.length - 1} type="button" on:click={() => onNavigate(index)}>{crumb.name}</button>
    {/each}
  </nav>

  {#if feedback}
    <p class={`drive-panel__feedback tone-${feedback.tone}`} aria-live="polite">{feedback.text}</p>
  {/if}

  {#if error}
    <p class="drive-panel__error" aria-live="polite">{error}</p>
  {/if}

  {#if activeDialog}
    <section class="drive-panel__dialog" aria-live="polite">
      {#if activeDialog === 'create'}
        <form class="drive-panel__dialog-card" on:submit|preventDefault={onSubmitCreateFolder}>
          <h2>新建文件夹</h2>
          <p>在当前目录里创建一个新文件夹。</p>
          <label>
            <span>文件夹名称</span>
            <input
              name="folder-name"
              type="text"
              value={draftName}
              on:input={(event) => onDraftNameChange((event.currentTarget as HTMLInputElement).value)}
              placeholder="例如：Uploads"
              maxlength="120"
              autofocus
            />
          </label>
          <div class="drive-panel__dialog-actions">
            <button type="button" on:click={onCancelDialog}>取消</button>
            <button type="submit" disabled={submitDisabled}>创建</button>
          </div>
        </form>
      {:else if activeDialog === 'rename' && selectedItem}
        <form class="drive-panel__dialog-card" on:submit|preventDefault={onSubmitRename}>
          <h2>重命名项目</h2>
          <p>把“{selectedItem.name}”改成新的名称。</p>
          <label>
            <span>新名称</span>
            <input
              name="rename-name"
              type="text"
              value={draftName}
              on:input={(event) => onDraftNameChange((event.currentTarget as HTMLInputElement).value)}
              maxlength="120"
              autofocus
            />
          </label>
          <div class="drive-panel__dialog-actions">
            <button type="button" on:click={onCancelDialog}>取消</button>
            <button type="submit" disabled={submitDisabled}>保存</button>
          </div>
        </form>
      {:else if activeDialog === 'delete' && selectedItem}
        <form class="drive-panel__dialog-card" on:submit|preventDefault={onSubmitDelete}>
          <h2>删除项目</h2>
          <p>确定删除“{selectedItem.name}”吗？文件夹会连同内部内容一起删除。</p>
          <div class="drive-panel__dialog-actions">
            <button type="button" on:click={onCancelDialog}>取消</button>
            <button type="submit" class="is-danger" disabled={submitDisabled}>确认删除</button>
          </div>
        </form>
      {/if}
    </section>
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
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  on:load={() => onPreviewStatusChange(item.id, 'ready')}
                  on:error={() => onPreviewStatusChange(item.id, 'error')}
                />
              {:else}
                <span>{isFolder(item) ? 'DIR' : 'FILE'}</span>
              {/if}
            </div>
            <div class="drive-panel__item-copy">
              <h2>{item.name}</h2>
              <p>{describeDriveItem(item)} {#if !isFolder(item)}· {formatDriveBytes(item.size || 0)}{/if}</p>
              {#if isMedia(item) && !isFolder(item)}
                {#if item.preview_status === 'loading'}
                  <p>媒体预览加载中…</p>
                {:else if item.preview_status === 'error'}
                  <p>媒体状态异常，可能无法直接预览。</p>
                {:else}
                  <p>媒体可直接打开预览。</p>
                {/if}
              {/if}
            </div>
          </div>

          <div class="drive-panel__item-actions">
            {#if isFolder(item)}
              <button class="drive-panel__pill" type="button" on:click={() => onOpen(item)}>{getDriveItemOpenLabel(item)}</button>
            {:else if item.url}
              <a class="drive-panel__pill" href={item.url} target="_blank" rel="noreferrer">{getDriveItemOpenLabel(item)}</a>
            {/if}
            <button class="drive-panel__pill" type="button" on:click={() => onStartRename(item)}>改名</button>
            <button class="drive-panel__pill" type="button" on:click={() => onStartDelete(item)}>删除</button>
          </div>
        </article>
      {/each}
    {:else}
      <p class="drive-panel__empty">这个目录还没有文件。</p>
    {/if}
  </div>
</section>

<style>
  .drive-route {
    display: grid;
    gap: 1rem;
  }

  .drive-panel__hero,
  .drive-panel__summary,
  .drive-panel__item,
  .drive-panel__empty,
  .drive-panel__dialog-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.5rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .drive-panel__hero {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    align-items: start;
  }

  .drive-panel__actions,
  .drive-panel__breadcrumbs,
  .drive-panel__item-actions,
  .drive-panel__dialog-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .drive-panel__actions input {
    display: none;
  }

  .drive-panel__pill,
  .drive-panel__breadcrumbs button,
  .drive-panel__dialog-actions button {
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 0.7rem 1rem;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    text-decoration: none;
    font: inherit;
  }

  .drive-panel__breadcrumbs button.index-active {
    background: rgba(255, 255, 255, 0.16);
  }

  .drive-panel__summary {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }

  .drive-panel__summary-label {
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    opacity: 0.65;
  }

  .drive-panel__summary strong {
    font-size: 1.25rem;
    font-weight: 900;
  }

  .drive-panel__meter {
    overflow: hidden;
    height: 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .drive-panel__meter-bar {
    height: 100%;
    background: var(--color-primary, #fac7b7);
  }

  .drive-panel__feedback,
  .drive-panel__error {
    border-radius: 1rem;
    padding: 0.85rem 1rem;
    font-weight: 700;
  }

  .drive-panel__feedback.tone-success {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .drive-panel__feedback.tone-error,
  .drive-panel__error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .drive-panel__feedback.tone-info {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .drive-panel__dialog {
    display: grid;
  }

  .drive-panel__dialog-card {
    max-width: 32rem;
  }

  .drive-panel__dialog-card h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .drive-panel__dialog-card p {
    margin: 0 0 0.85rem;
    line-height: 1.6;
    opacity: 0.82;
  }

  .drive-panel__dialog-card label {
    display: grid;
    gap: 0.45rem;
    margin-bottom: 1rem;
  }

  .drive-panel__dialog-card input {
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 15, 26, 0.5);
    color: inherit;
    padding: 0.8rem 0.95rem;
    font: inherit;
  }

  .drive-panel__dialog-actions .is-danger {
    background: rgba(239, 68, 68, 0.16);
  }

  .drive-panel__list {
    display: grid;
    gap: 0.75rem;
  }

  .drive-panel__item {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: center;
  }

  .drive-panel__item-main {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-width: 0;
  }

  .drive-panel__item-copy {
    min-width: 0;
  }

  .drive-panel__item-copy h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .drive-panel__item-copy p {
    margin: 0.2rem 0 0;
    opacity: 0.75;
  }

  .drive-panel__thumb {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .drive-panel__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .is-skeleton {
    min-height: 5rem;
    opacity: 0.4;
  }

  @media (max-width: 720px) {
    .drive-panel__item {
      flex-direction: column;
      align-items: stretch;
    }

    .drive-panel__item-actions {
      justify-content: flex-start;
    }
  }
</style>
