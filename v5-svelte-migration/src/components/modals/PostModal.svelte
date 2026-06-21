<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { closeModal, openModal } from '../../stores/modalState';
  import { isAuthenticated, user } from '../../stores/appState';
  import { COMMUNITY_MEDIA_UPLOAD_ENDPOINT, communityFetch } from '../../lib/communityApi';

  let contentInput: HTMLTextAreaElement | null = null;
  let fileInput: HTMLInputElement | null = null;
  let content = '';
  let media: Array<{ type: 'image'; url: string; fileId?: string; [key: string]: unknown }> = [];
  let loading = false;
  let uploading = false;
  let error = '';

  async function handleFileUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    uploading = true;
    error = '';
    try {
      const uploaded = [] as typeof media;
      let failedCount = 0;

      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, { method: 'POST', body: formData });
          const data = await res.json();
          const url = data?.file?.url || data?.url;
          if (!res.ok || !data?.ok || !url) throw new Error(data?.msg || '图片没传上去，再试一次。');
          uploaded.push({ type: 'image', url, fileId: data?.file?.id || data?.fileId });
        } catch (nextError) {
          failedCount += 1;
          console.error('Upload failed', nextError);
        }
      }

      if (uploaded.length > 0) media = [...media, ...uploaded];
      if (failedCount > 0) error = failedCount === files.length ? '图片没传上去，再试一次。' : `${failedCount} 张图片没传上去，其余已保留。`;
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  async function handleSubmit() {
    if (loading || uploading || (!content.trim() && media.length === 0)) return;
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
        body: JSON.stringify({ content: content.trim(), media })
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
    } catch (nextError) {
      console.error('Post failed', nextError);
      error = '这条动态没有发出去。';
    } finally {
      loading = false;
    }
  }

  function removeMedia(index: number) {
    media = media.filter((_, itemIndex) => itemIndex !== index);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  }

  onMount(() => {
    requestAnimationFrame(() => contentInput?.focus());
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<div class="post-modal-frame" transition:fade={{ duration: 160 }}>
  <button type="button" class="scrim" on:click={closeModal} aria-label="关闭发帖弹窗"></button>

  <div
    data-modal-shell="true"
    role="dialog"
    aria-modal="true"
    aria-label="写动态"
    tabindex="-1"
    class="post-modal-shell"
    in:fly={{ y: 12, duration: 220 }}
  >
    <header class="composer-topbar">
      <button type="button" class="composer-cancel" on:click={closeModal}>取消</button>
      <div class="composer-title">
        <span>8Community</span>
        <strong>写动态</strong>
      </div>
      <button
        type="button"
        class="composer-publish"
        on:click={handleSubmit}
        disabled={loading || uploading || (!content.trim() && media.length === 0)}
      >
        {loading ? '发布中' : '发布'}
      </button>
    </header>

    <div class="composer-scroll">
      <section class="composer-card" aria-labelledby="post-modal-title">
        <div class="composer-author">
          <span class="author-avatar">{$isAuthenticated ? ($user?.username?.slice(0, 1).toUpperCase() || '我') : '/'}</span>
          <div>
            <h2 id="post-modal-title">{$isAuthenticated ? ($user?.username || '我') : '登录后发布'}</h2>
            <p>{$isAuthenticated ? '发布到社区动态' : '登录后就能发布，也能顺手传图。'}</p>
          </div>
        </div>

        <textarea
          bind:this={contentInput}
          data-modal-initial-focus="true"
          bind:value={content}
          placeholder="今天想说什么？"
          class="composer-input"
        ></textarea>

        <div class="media-area">
          {#if media.length > 0}
            <div class="media-grid">
              {#each media as item, index}
                <figure>
                  <img src={item.url} alt="预览" />
                  <button type="button" on:click={() => removeMedia(index)} aria-label="移除图片">移除</button>
                </figure>
              {/each}
            </div>
          {/if}

          <button type="button" class="media-add" on:click={() => fileInput?.click()} disabled={uploading}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <path d="m21 15-5-5L5 21"></path>
            </svg>
            <span>{uploading ? '上传中' : '加图片'}</span>
          </button>
          <input bind:this={fileInput} type="file" accept="image/*" multiple hidden on:change={handleFileUpload} />
        </div>
      </section>

      <section class="publish-panel" aria-label="发布设置">
        <div class="publish-row">
          <span class="row-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
          </span>
          <span>发布到</span>
          <strong>社区动态</strong>
        </div>
        <div class="publish-row">
          <span class="row-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </span>
          <span>谁可以看</span>
          <strong>所有人可见</strong>
        </div>
      </section>

      {#if error}<p class="error">{error}</p>{/if}
    </div>
  </div>
</div>

<style>
  .post-modal-frame {
    position: fixed;
    top: var(--app-modal-viewport-top, 0);
    left: 0;
    right: 0;
    height: var(--app-modal-viewport-height, 100dvh);
    z-index: 11000;
    display: grid;
    place-items: center;
    padding: var(--s3);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(2px);
  }

  .post-modal-shell {
    position: relative;
    display: flex;
    width: min(100%, 680px);
    max-height: calc(var(--app-modal-viewport-height, 100dvh) - (var(--s3) * 2));
    flex-direction: column;
    border: 1px solid var(--hairline);
    border-radius: 28px;
    background:
      linear-gradient(180deg, rgba(250, 249, 245, 0.96), rgba(240, 238, 230, 0.96)),
      var(--paper);
    box-shadow: 0 28px 72px rgba(25, 25, 25, 0.16);
    overflow: hidden;
  }

  .composer-topbar {
    display: grid;
    grid-template-columns: minmax(4.5rem, 1fr) auto minmax(4.5rem, 1fr);
    align-items: center;
    gap: var(--s3);
    border-bottom: 1px solid var(--hairline);
    background: rgba(250, 249, 245, 0.92);
    padding: var(--s3) var(--s4);
  }

  .composer-cancel,
  .composer-publish {
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 700;
  }

  .composer-cancel {
    justify-self: start;
    color: var(--ink-soft);
  }

  .composer-title {
    display: grid;
    gap: 2px;
    text-align: center;
  }

  .composer-title span {
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .composer-title strong {
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 800;
  }

  .composer-publish {
    justify-self: end;
    min-width: 72px;
    border-radius: var(--r-btn);
    background: var(--clay);
    color: var(--paper);
    padding: 10px 16px;
  }

  .composer-publish:disabled {
    background: rgba(178, 116, 91, 0.28);
    color: rgba(250, 249, 245, 0.82);
  }

  .composer-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: var(--s4);
  }

  .composer-card,
  .publish-panel {
    border: 1px solid var(--hairline);
    border-radius: 24px;
    background: var(--surface);
  }

  .composer-card {
    padding: var(--s4);
  }

  .composer-author {
    display: flex;
    align-items: center;
    gap: var(--s3);
    margin-bottom: var(--s3);
  }

  .author-avatar {
    display: grid;
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 999px;
    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 800;
  }

  h2 {
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 800;
    line-height: 1.2;
  }

  .composer-author p {
    margin-top: 3px;
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 12px;
  }

  .composer-input {
    width: 100%;
    min-height: 240px;
    resize: none;
    border: 0;
    background: transparent;
    padding: var(--s2) 0 var(--s4);
    color: var(--ink);
    font-size: 21px;
    line-height: 1.7;
  }

  .composer-input:focus {
    outline: none;
  }

  .composer-input::placeholder {
    color: rgba(25, 25, 25, 0.34);
  }

  .media-area {
    display: grid;
    gap: var(--s3);
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s2);
  }

  figure {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--hairline);
    border-radius: var(--r-btn);
  }

  figure img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  figure button {
    position: absolute;
    inset: auto var(--s1) var(--s1);
    border-radius: var(--r-btn);
    background: rgba(25, 25, 25, 0.62);
    color: white;
    font-family: var(--sans);
    font-size: 12px;
    padding: 4px 6px;
  }

  .media-add {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 8px;
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--r-btn);
    background: var(--paper);
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 800;
    padding: 12px 14px;
  }

  .media-add:disabled {
    opacity: 0.55;
  }

  .publish-panel {
    display: grid;
    margin-top: var(--s3);
    overflow: hidden;
  }

  .publish-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--s3);
    min-height: 58px;
    padding: 0 var(--s4);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 800;
  }

  .publish-row + .publish-row {
    border-top: 1px solid var(--hairline);
  }

  .publish-row strong {
    color: var(--ink-soft);
    font-size: 13px;
  }

  .row-icon {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    color: var(--ink-soft);
  }

  .error {
    margin-top: var(--s3);
    border: 1px solid rgba(178, 54, 42, 0.2);
    border-radius: var(--r-btn);
    background: rgba(178, 54, 42, 0.07);
    color: #8b2e24;
    padding: 10px 12px;
    font-size: 14px;
  }

  @media (max-width: 520px) {
    .post-modal-frame {
      padding: 0;
    }

    .post-modal-shell {
      width: 100%;
      height: var(--app-modal-viewport-height, 100dvh);
      max-height: var(--app-modal-viewport-height, 100dvh);
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .composer-topbar {
      padding: max(14px, env(safe-area-inset-top)) var(--s3) 12px;
    }

    .composer-scroll {
      padding: var(--s3);
      padding-bottom: max(var(--s4), env(safe-area-inset-bottom));
    }

    .composer-card {
      border-radius: 20px;
      padding: var(--s3);
    }

    .composer-input {
      min-height: 280px;
      font-size: 20px;
    }

    .publish-panel {
      border-radius: 20px;
    }

    .media-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
