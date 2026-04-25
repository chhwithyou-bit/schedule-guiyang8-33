<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { closeModal, openModal } from '../../stores/modalState';
  import { user, isAuthenticated } from '../../stores/appState';
  import { communityFetch } from '../../lib/communityApi';
  import { softReveal } from '../../lib/motion';

  let shellRef: HTMLElement | null = null;
  let contentInput: HTMLTextAreaElement | null = null;
  let content = '';
  let media: any[] = [];
  let loading = false;
  let error = '';
  let fileInput: HTMLInputElement;

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
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    loading = true;
    error = '';
    for (const file of Array.from(files)) {
      try {
        const res = await communityFetch('/api/community/upload', {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': file.type }
        });
        const data = await res.json();
        if (data.ok) {
          media = [...media, { type: 'image', url: data.url, fileId: data.fileId }];
        } else {
          error = data.msg || '图片没传上去，再试一次。';
        }
      } catch (err) {
        console.error('Upload failed', err);
        error = '图片没传上去，再试一次。';
      }
    }
    loading = false;
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
  class="post-modal-frame fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6"
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

      <div class="flex items-center justify-between gap-4">
        <div class="flex gap-4">
          <button
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
</style>
