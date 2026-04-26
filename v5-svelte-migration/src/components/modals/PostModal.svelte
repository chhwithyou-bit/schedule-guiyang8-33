<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { closeModal, openModal } from '../../stores/modalState';
  import { user, isAuthenticated } from '../../stores/appState';
  import { communityFetch } from '../../lib/communityApi';
  import { runLimitedConcurrency } from '../../lib/uploadQueue.mjs';
  import { softReveal } from '../../lib/motion';

  const IMAGE_UPLOAD_CONCURRENCY = 3;
  const MAX_IMAGE_EDGE = 1800;
  const IMAGE_COMPRESSION_QUALITY = 0.82;

  let shellRef: HTMLElement | null = null;
  let contentInput: HTMLTextAreaElement | null = null;
  let content = '';
  let media: any[] = [];
  let loading = false;
  let error = '';
  let fileInput: HTMLInputElement;
  let webpSupported: boolean | null = null;

  type PreparedUpload = {
    file: File;
    originalSize: number;
    uploadSize: number;
  };

  type LoadedImage = {
    source: CanvasImageSource;
    width: number;
    height: number;
    close: () => void;
  };

  type UploadedMedia = {
    type: 'image';
    url: string;
    fileId: string;
    driveSync?: string;
    originalSize: number;
    uploadSize: number;
    timing?: unknown;
  };

  function canEncodeWebp() {
    if (webpSupported !== null) return webpSupported;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    return webpSupported;
  }

  function getCompressedMime(file: File) {
    if (canEncodeWebp()) return 'image/webp';
    if (file.type === 'image/png') return 'image/png';
    return 'image/jpeg';
  }

  function extensionForMime(mime: string) {
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/png') return 'png';
    return 'jpg';
  }

  function replaceFileExtension(name: string, extension: string) {
    const baseName = name.replace(/\.[^.]+$/, '').trim() || 'image';
    return `${baseName}.${extension}`;
  }

  function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, quality);
    });
  }

  async function loadImage(file: File): Promise<LoadedImage> {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      await image.decode();
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(objectUrl)
      };
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      throw err;
    }
  }

  async function compressImage(file: File) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return file;
    }

    const loaded = await loadImage(file);
    try {
      const longestEdge = Math.max(loaded.width, loaded.height);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(longestEdge, 1));
      const width = Math.max(1, Math.round(loaded.width * scale));
      const height = Math.max(1, Math.round(loaded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return file;

      context.drawImage(loaded.source, 0, 0, width, height);

      const mime = getCompressedMime(file);
      const blob = await canvasToBlob(canvas, mime, IMAGE_COMPRESSION_QUALITY);
      if (!blob || blob.size >= file.size) return file;

      return new File([blob], replaceFileExtension(file.name, extensionForMime(mime)), {
        type: mime,
        lastModified: file.lastModified
      });
    } catch (err) {
      console.warn('Image compression skipped', err);
      return file;
    } finally {
      loaded.close();
    }
  }

  async function prepareUpload(file: File): Promise<PreparedUpload> {
    const compressed = await compressImage(file);
    return {
      file: compressed,
      originalSize: file.size,
      uploadSize: compressed.size
    };
  }

  async function uploadCommunityImage(file: File): Promise<UploadedMedia> {
    const prepared = await prepareUpload(file);
    const uploadFile = prepared.file;
    const res = await communityFetch('/api/community/upload', {
      method: 'POST',
      body: uploadFile,
      headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' }
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.msg || '图片没传上去，再试一次。');
    }

    return {
      type: 'image',
      url: data.url,
      fileId: data.fileId,
      driveSync: data.driveSync,
      originalSize: prepared.originalSize,
      uploadSize: prepared.uploadSize,
      timing: data.timing
    };
  }

  function getFocusableElements() {
    if (!shellRef) return [];

    return Array.from(
      shellRef.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      shellRef?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!current || current === firstElement || !shellRef?.contains(current)) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (!current || current === lastElement || !shellRef?.contains(current)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  async function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    loading = true;
    error = '';
    const failures: string[] = [];
    try {
      const uploaded = await runLimitedConcurrency(files, IMAGE_UPLOAD_CONCURRENCY, async (file: File) => {
        try {
          return await uploadCommunityImage(file);
        } catch (err) {
          console.error('Upload failed', err);
          failures.push(file.name);
          return null;
        }
      });
      const successfulUploads = uploaded.filter((item): item is UploadedMedia => Boolean(item));
      if (successfulUploads.length > 0) {
        media = [...media, ...successfulUploads];
      }
      if (failures.length > 0) {
        error = '图片没传上去，再试一次。';
      }
    } finally {
      loading = false;
      input.value = '';
    }
  }

  async function handleSubmit() {
    if (!content.trim() && media.length === 0) return;
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    loading = true;
    error = '';
    try {
      const res = await communityFetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          media
        })
      });
      const data = await res.json();
      if (data.ok) {
        content = '';
        media = [];
        closeModal();
        window.dispatchEvent(new CustomEvent('post-created'));
      } else {
        error = data.msg || '这条动态没有发出去。';
      }
    } catch (err) {
      console.error('Post failed', err);
      error = '这条动态没有发出去。';
    } finally {
      loading = false;
    }
  }

  function removeMedia(index: number) {
    media = media.filter((_, i) => i !== index);
  }

  function openFilePicker() {
    fileInput?.click();
  }

  onMount(() => {
    const handleDocumentKeydown = (event: KeyboardEvent) => {
      if (!shellRef) {
        return;
      }

      if (!shellRef.contains(document.activeElement) && document.activeElement !== shellRef) {
        return;
      }

      handleKeydown(event);
    };

    document.addEventListener('keydown', handleDocumentKeydown);

    void tick().then(() => {
      requestAnimationFrame(() => {
        contentInput?.focus();
      });
    });

    return () => {
      document.removeEventListener('keydown', handleDocumentKeydown);
    };
  });
</script>

<div
  class="post-modal-frame fixed inset-0 z-[11000] flex items-center justify-center p-4 sm:p-6"
  transition:fade={{ duration: 260 }}
>
  <button type="button" class="post-modal-backdrop absolute inset-0" on:click={closeModal} aria-label="关闭发帖弹窗"></button>

  <div
    bind:this={shellRef}
    data-modal-shell="true"
    role="dialog"
    aria-modal="true"
    aria-labelledby="post-modal-title"
    tabindex="-1"
    class="post-modal-shell relative w-full max-w-xl overflow-hidden rounded-[36px] p-6 text-[var(--color-text,#fff4ed)] sm:p-8"
    transition:softReveal={{ y: 16, duration: 260, startScale: 0.987, blur: 6 }}
  >
    <div class="relative z-10">
      <div class="mb-8 flex items-center justify-between gap-4">
        <h2 id="post-modal-title" class="text-3xl font-black uppercase tracking-tighter text-[var(--color-text,#fff4ed)]">发点近况</h2>
        <button on:click={closeModal} class="post-modal-close p-2 transition-all text-[var(--color-text,#fff4ed)]" aria-label="关闭发帖弹窗">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <textarea
        bind:this={contentInput}
        data-modal-initial-focus="true"
        bind:value={content}
        placeholder="今天想说什么，直接写下来。"
        class="post-modal-textarea mb-6 h-40 w-full resize-none rounded-3xl px-6 py-6 text-lg font-semibold text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 caret-[var(--color-primary,#fac7b7)] outline-none transition-all"
      ></textarea>

      <div class="post-modal-status-panel mb-6 rounded-[28px] p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-black uppercase tracking-[0.24em] opacity-60">发帖面板</p>
            <p class="mt-2 text-sm opacity-70">
              {$isAuthenticated ? `现在是 ${$user?.username || '你'} 在发帖。` : '登录后就能发帖，也能顺手传图。'}
            </p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-black tracking-tight">{content.trim().length}</p>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">字数</p>
          </div>
        </div>
      </div>

      {#if media.length > 0}
        <div class="mb-6 grid grid-cols-4 gap-4">
          {#each media as item, i}
            <div class="post-modal-media-item relative aspect-square overflow-hidden rounded-2xl group">
              <img src={item.url} alt="Preview" class="h-full w-full object-cover" />
              <button
                on:click={() => removeMedia(i)}
                class="post-modal-media-remove absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="移除图片"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if error}
        <p class="post-modal-error mb-6 rounded-2xl px-4 py-3 text-sm font-bold text-red-100">
          {error}
        </p>
      {/if}

      <div class="post-modal-actions flex items-center justify-between gap-4">
        <div class="post-modal-media-actions flex min-w-0 gap-4">
          <button
            type="button"
            on:click={openFilePicker}
            class="post-modal-media-trigger flex h-14 w-14 items-center justify-center rounded-2xl text-xl transition-all"
            title="加图片"
            aria-label="添加图片"
          >
            <span aria-hidden="true">+</span>
          </button>
          <input
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            bind:this={fileInput}
            on:change={handleFileUpload}
          />
        </div>

        <button
          type="button"
          on:click={handleSubmit}
          disabled={loading || (!content.trim() && media.length === 0)}
          class="post-modal-submit rounded-2xl px-10 py-5 text-lg font-black transition-all disabled:opacity-30 disabled:hover:scale-100"
        >
          {loading ? '正在发出…' : '发出去'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .post-modal-frame {
    isolation: isolate;
  }

  .post-modal-backdrop {
    background:
      radial-gradient(circle at top, rgba(var(--glow-primary-rgb), 0.12), transparent 42%),
      linear-gradient(180deg, rgba(12, 10, 13, 0.3), rgba(12, 10, 13, 0.48));
    backdrop-filter: blur(16px);
  }

  .post-modal-shell {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.08)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.18)),
      rgba(var(--color-bg-rgb), 0.74);
    box-shadow:
      0 28px 80px rgba(var(--shadow-rgb), 0.26),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(22px) saturate(1.05);
  }

  .post-modal-close,
  .post-modal-media-trigger {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.12)),
      rgba(var(--color-bg-rgb), 0.2);
    box-shadow:
      0 10px 24px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .post-modal-close {
    opacity: 0.72;
  }

  .post-modal-close:hover,
  .post-modal-media-trigger:hover,
  .post-modal-submit:hover {
    transform: translateY(-1px);
  }

  .post-modal-textarea,
  .post-modal-status-panel,
  .post-modal-media-item,
  .post-modal-error {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.08), rgba(var(--glow-secondary-rgb), 0.05)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.12)),
      rgba(var(--color-bg-rgb), 0.18);
    box-shadow:
      0 18px 42px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
  }

  .post-modal-textarea:focus {
    border-color: rgba(var(--glow-primary-rgb), 0.32);
    box-shadow:
      0 0 0 2px rgba(var(--glow-primary-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .post-modal-media-remove {
    background: linear-gradient(180deg, rgba(12, 10, 13, 0.16), rgba(12, 10, 13, 0.5));
    backdrop-filter: blur(12px);
  }

  .post-modal-error {
    border-color: rgba(248, 113, 113, 0.24);
    background:
      linear-gradient(145deg, rgba(248, 113, 113, 0.16), rgba(127, 29, 29, 0.12)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(127, 29, 29, 0.16)),
      rgba(69, 10, 10, 0.24);
  }

  .post-modal-submit {
    background: var(--color-primary, #fac7b7);
    color: var(--color-button-text, #231b22);
    box-shadow:
      0 16px 34px rgba(var(--shadow-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  @media (max-width: 480px) {
    .post-modal-frame {
      align-items: flex-end;
      padding: 0.75rem;
      padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
    }

    .post-modal-shell {
      max-height: calc(100svh - 1.5rem);
      overflow-y: auto;
      border-radius: 1.75rem;
      padding: 1rem;
    }

    .post-modal-actions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: stretch;
      gap: 0.75rem;
    }

    .post-modal-media-actions,
    .post-modal-media-trigger,
    .post-modal-submit {
      min-width: 0;
    }

    .post-modal-submit {
      width: 100%;
      padding: 0.95rem 1rem;
      font-size: 0.95rem;
      white-space: nowrap;
    }

    .post-modal-media-trigger {
      width: 3.35rem;
      height: 3.35rem;
      border-radius: 1rem;
    }
  }
</style>
