<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { closeModal } from '../../stores/modalState';
  import { user, isAuthenticated } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';

  let content = '';
  let media: any[] = [];
  let loading = false;
  let error = '';
  let fileInput: HTMLInputElement;

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
        // Trigger a refresh event or update a store
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
</script>

<div 
  class="fixed inset-0 z-[10000] flex items-center justify-center p-6"
  transition:fade={{ duration: 300 }}
>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="absolute inset-0 bg-black/60 backdrop-blur-xl" on:click={closeModal}></div>

  <div 
    class="relative w-full max-w-xl bg-[var(--color-bg)] rounded-[40px] p-8 shadow-2xl overflow-hidden"
    transition:fly={{ y: 50, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <div class="relative z-10">
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-3xl font-black tracking-tighter uppercase">发点近况</h2>
        <button on:click={closeModal} class="p-2 opacity-20 hover:opacity-100 transition-opacity">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <textarea 
        bind:value={content}
        placeholder="今天想说什么，直接写下来。"
        class="w-full h-40 px-6 py-6 rounded-3xl bg-neutral-100 dark:bg-neutral-900 border-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-medium text-lg resize-none mb-6"
      ></textarea>

      <div class="mb-6 rounded-[28px] border border-white/10 bg-white/5 p-5">
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
        <div class="grid grid-cols-4 gap-4 mb-6">
          {#each media as item, i}
            <div class="relative aspect-square rounded-2xl overflow-hidden group">
              <img src={item.url} alt="Preview" class="w-full h-full object-cover" />
              <button 
                on:click={() => removeMedia(i)}
                class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if error}
        <p class="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
          {error}
        </p>
      {/if}

      <div class="flex items-center justify-between">
        <div class="flex gap-4">
          <button 
            on:click={openFilePicker}
            class="w-14 h-14 flex items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-900 hover:scale-110 active:scale-95 transition-all text-xl"
            title="加图片"
          >
            🖼️
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
          class="px-10 py-5 bg-[var(--color-primary)] text-white font-black text-lg rounded-2xl shadow-lg hover:scale-[1.05] active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
        >
          {loading ? '正在发出…' : '发出去'}
        </button>
      </div>
    </div>
  </div>
</div>
