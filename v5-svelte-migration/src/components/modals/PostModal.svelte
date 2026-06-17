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
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, { method: 'POST', body: formData });
        const data = await res.json();
        const url = data?.file?.url || data?.url;
        if (!res.ok || !data?.ok || !url) throw new Error(data?.msg || '图片没传上去，再试一次。');
        uploaded.push({ type: 'image', url, fileId: data?.file?.id || data?.fileId });
      }
      media = [...media, ...uploaded];
    } catch (nextError: any) {
      console.error('Upload failed', nextError);
      error = nextError?.message || '图片没传上去，再试一次。';
    } finally {
      uploading = false;
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

  onMount(() => {
    requestAnimationFrame(() => contentInput?.focus());
  });
</script>

<div class="post-modal-frame" transition:fade={{ duration: 160 }}>
  <button type="button" class="scrim" on:click={closeModal} aria-label="关闭发帖弹窗"></button>

  <div
    data-modal-shell="true"
    role="dialog"
    aria-modal="true"
    aria-label="发点近况"
    tabindex="-1"
    class="post-modal-shell"
    in:fly={{ y: 12, duration: 220 }}
  >
    <button type="button" class="close" on:click={closeModal} aria-label="关闭发帖弹窗">×</button>
    <p class="ui-kicker">Post</p>
    <h2 id="post-modal-title">发点近况</h2>
    <p class="sub">{$isAuthenticated ? `现在是 ${$user?.username || '你'} 在发帖。` : '登录后就能发帖，也能顺手传图。'}</p>

    <textarea
      bind:this={contentInput}
      data-modal-initial-focus="true"
      bind:value={content}
      placeholder="今天想说什么，直接写下来。"
      class="composer-input"
    ></textarea>

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

    {#if error}<p class="error">{error}</p>{/if}

    <div class="actions">
      <button type="button" class="ui-button-ghost" on:click={() => fileInput?.click()} disabled={uploading}>
        {uploading ? '上传中' : '加图片'}
      </button>
      <input bind:this={fileInput} type="file" accept="image/*" multiple hidden on:change={handleFileUpload} />

      <button type="button" class="ui-button-primary submit" on:click={handleSubmit} disabled={loading || uploading || (!content.trim() && media.length === 0)}>
        {loading ? '正在发出...' : '发出去'}
      </button>
    </div>
  </div>
</div>

<style>
  .post-modal-frame {
    position: fixed;
    inset: 0;
    z-index: 11000;
    display: grid;
    place-items: center;
    padding: var(--s3);
  }

  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(2px);
  }

  .post-modal-shell {
    position: relative;
    width: min(100%, 560px);
    border: 1px solid var(--hairline);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: 0 24px 60px -24px rgba(25, 25, 25, 0.22);
    padding: var(--s5) var(--s4) var(--s4);
  }

  .close {
    position: absolute;
    top: var(--s3);
    right: var(--s3);
    width: 30px;
    height: 30px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    color: var(--ink-soft);
    font-family: var(--sans);
  }

  h2 {
    margin-top: var(--s1);
    font-family: var(--serif);
    font-size: clamp(30px, 5vw, 42px);
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .sub {
    margin-top: var(--s2);
    margin-bottom: var(--s4);
    color: var(--ink-soft);
  }

  .composer-input {
    width: 100%;
    min-height: 180px;
    resize: vertical;
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    background: var(--paper);
    padding: var(--s3);
    font-size: 18px;
    line-height: 1.65;
  }

  .composer-input:focus {
    border-color: var(--clay);
    outline: none;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--s2);
    margin-top: var(--s3);
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

  .error {
    margin-top: var(--s3);
    border: 1px solid rgba(178, 54, 42, 0.2);
    border-radius: var(--r-btn);
    background: rgba(178, 54, 42, 0.07);
    color: #8b2e24;
    padding: 10px 12px;
    font-size: 14px;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s2);
    margin-top: var(--s4);
  }

  .submit {
    min-width: 120px;
  }

  @media (max-width: 520px) {
    .post-modal-frame {
      align-items: end;
      padding: var(--s2);
    }

    .post-modal-shell {
      max-height: calc(100svh - 2rem);
      overflow-y: auto;
      padding: var(--s4) var(--s3) var(--s3);
    }

    .media-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
