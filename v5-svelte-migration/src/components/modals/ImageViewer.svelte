<script lang="ts">
  import { previewImageUrl } from '../../stores/appState';
  import { fade, scale } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';

  function close() {
    previewImageUrl.set(null);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

{#if $previewImageUrl}
  <div class="image-viewer-overlay fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-8" in:fade={{ duration: 200 }} out:fade={{ duration: 150 }}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" on:click={close}></div>
    
    <button type="button" class="absolute right-4 top-4 z-[20001] rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-white/20" on:click={close} aria-label="关闭图片">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <img 
      src={$previewImageUrl} 
      alt="Preview" 
      class="relative z-[20001] max-h-full max-w-full object-contain shadow-2xl"
      in:scale={{ duration: 250, start: 0.95 }}
      on:click={(e) => e.stopPropagation()}
    />
  </div>
{/if}
