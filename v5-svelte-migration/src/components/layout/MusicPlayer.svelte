<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';

  let isOpen = false;
  let isPlaying = false;
  let progress = 0;
  let currentTrack = {
    name: 'Loading...',
    artist: 'Various Artists',
    cover: null
  };

  function togglePlayer() {
    isOpen = !isOpen;
  }

  function togglePlay(e: Event) {
    e.stopPropagation();
    isPlaying = !isPlaying;
  }
</script>

<div 
  class="fixed left-6 bottom-8 z-[1000] flex items-center transition-all duration-700 ease-[cubic-bezier(0.2,1.14,0.24,1)] overflow-hidden
         {isOpen ? 'w-64 h-20 rounded-[28px] bg-white/80 dark:bg-neutral-900/80' : 'w-14 h-14 rounded-full bg-[var(--color-primary)]'} 
         backdrop-blur-2xl shadow-2xl border border-white/20"
  on:click={togglePlayer}
  on:keydown={(e) => e.key === 'Enter' && togglePlayer()}
  role="button"
  tabindex="0"
>
  <!-- Icon / Avatar -->
  <div class="absolute left-1.5 w-11 h-11 flex items-center justify-center rounded-full transition-all duration-700 {isOpen ? 'bg-neutral-200 dark:bg-neutral-800' : ''}">
    {#if !isOpen}
      <svg class="w-6 h-6 text-white {isPlaying ? 'animate-pulse' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
      </svg>
    {:else}
      <div class="w-full h-full rounded-full overflow-hidden bg-[var(--color-primary)] flex items-center justify-center">
        <span class="text-white font-black text-xs">8C</span>
      </div>
    {/if}
  </div>

  <!-- Expanded Content -->
  {#if isOpen}
    <div in:fade={{ delay: 200 }} class="pl-16 pr-4 w-full">
      <div class="flex items-center justify-between mb-1">
        <div class="min-w-0">
          <p class="text-xs font-black truncate">{currentTrack.name}</p>
          <p class="text-[10px] opacity-40 font-bold truncate uppercase tracking-tighter">{currentTrack.artist}</p>
        </div>
        <button 
          on:click={togglePlay}
          class="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-primary)] text-white hover:scale-110 transition-transform"
        >
          {#if isPlaying}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          {/if}
        </button>
      </div>
      
      <!-- Progress Bar -->
      <div class="h-1 w-full bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div class="h-full bg-[var(--color-primary)] transition-all" style="width: {progress}%"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Ensure it floats above content but respects safe areas */
  div {
    bottom: max(32px, calc(env(safe-area-inset-bottom) + 16px));
  }
</style>
