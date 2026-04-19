<script lang="ts">
  import { slide, fade } from 'svelte/transition';
  import { currentView } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { activeTheme } from '../../stores/theme';
  import { onMount } from 'svelte';
  
  let className = '';
  export { className as class };

  let isExpanded = false;
  let dockRef: HTMLElement;
  let grabHandleRef: HTMLElement;
  let startY = 0;

  const views = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'community', label: 'Community' },
    { id: 'nodes', label: 'Nodes' }
  ];

  const themes = [
    { id: 'theme-default', color: '#020029' },
    { id: 'theme-spring', color: '#85B581' },
    { id: 'theme-summer', color: '#B29BCE' },
    { id: 'theme-autumn', color: '#D17F71' }
  ];

  function toggleLiquidBar() {
    isExpanded = !isExpanded;
  }

  function handleNav(id: string) {
    currentView.set(id);
    isExpanded = false;
  }

  function requestTheme(id: string, e: MouseEvent) {
    // Dispatch a custom event that ThemeSwitcher will listen to
    window.dispatchEvent(new CustomEvent('request-theme-switch', { 
      detail: { id, x: e.clientX, y: e.clientY } 
    }));
  }

  // Handle gesture conflicts: enlarge hit area & prioritize tap, fallback to swipe
  function handleTouchStart(e: TouchEvent) {
    startY = e.touches[0].clientY;
  }

  function handleTouchEnd(e: TouchEvent) {
    const endY = e.changedTouches[0].clientY;
    const diffY = startY - endY;
    
    // Swipe Up -> Expand, Swipe Down -> Collapse
    if (diffY > 40 && !isExpanded) {
      isExpanded = true;
    } else if (diffY < -40 && isExpanded) {
      isExpanded = false;
    }
  }
</script>

<!-- 
  Centralized Liquid Bar Dock
  Z-index strictly managed to avoid conflict with full-screen overlays, but above page content.
  The `#comm-post-fab` is now integrated into this component to prevent floating conflicts.
-->
<nav 
  bind:this={dockRef}
  class="fixed bottom-0 left-0 right-0 z-[100] flex flex-col items-center pointer-events-none {className}"
>
  <!-- Expanded Menu Panel -->
  {#if isExpanded}
    <div 
      transition:slide={{ duration: 300, axis: 'y' }}
      class="w-full max-w-md bg-[var(--color-bg)] text-[var(--color-text)] rounded-t-3xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col items-center pb-6"
    >
      <!-- Enlarge gesture hit area for accessibility / mobile -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        bind:this={grabHandleRef}
        class="w-full py-4 flex justify-center cursor-grab active:cursor-grabbing hit-area-enlarged"
        on:click={toggleLiquidBar}
        on:touchstart|passive={handleTouchStart}
        on:touchend|passive={handleTouchEnd}
        on:keydown={(e) => e.key === 'Enter' && toggleLiquidBar()}
      >
        <div class="w-12 h-1.5 bg-gray-300 rounded-full"></div>
      </div>
      
      <div class="flex flex-col w-full px-6 space-y-4">
        {#each views as view}
          <button 
            class="py-3 px-6 text-xl font-bold tracking-tight rounded-xl transition-all duration-200 
                   {$currentView === view.id ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}"
            on:click={() => handleNav(view.id)}
          >
            {view.label}
          </button>
        {/each}
      </div>

      <!-- Theme Selection Integration -->
      <div class="flex gap-4 mt-6">
        {#each themes as t}
          <button 
            class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-125 {$activeTheme === t.id ? 'border-[var(--color-primary)]' : 'border-transparent'}"
            style="background-color: {t.color};"
            on:click={(e) => requestTheme(t.id, e)}
            aria-label="Switch to {t.id}"
          ></button>
        {/each}
      </div>

      <!-- Integrated Floating Action Button (FAB) -->
      {#if $currentView === 'community'}
        <div class="w-full px-6 pt-4 border-t mt-4 border-gray-100 dark:border-gray-800" transition:fade>
          <button 
            class="w-full py-4 bg-[var(--color-accent)] text-white font-black text-lg rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform"
            on:click={() => openModal('comm-post')}
          >
            + New Post
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Compact Nav Dock / Handle -->
  {#if !isExpanded}
    <div 
      transition:slide={{ duration: 300, axis: 'y' }}
      class="mb-6 pointer-events-auto"
    >
      <button 
        class="flex items-center gap-3 px-8 py-4 bg-[var(--color-primary)] text-white rounded-full shadow-2xl hover:scale-105 transition-transform"
        on:click={toggleLiquidBar}
      >
        <span class="w-6 h-6 flex flex-col justify-center gap-1.5">
          <span class="w-full h-0.5 bg-white rounded-full"></span>
          <span class="w-full h-0.5 bg-white rounded-full"></span>
        </span>
        <span class="font-bold tracking-wider text-sm uppercase">{$currentView}</span>
      </button>
    </div>
  {/if}
</nav>

<style>
  /* Fix layout geometry to prevent conflicts with Music Player (#mp) */
  nav {
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* Extends grab handle interactable area without visual bloat */
  .hit-area-enlarged {
    position: relative;
  }
  .hit-area-enlarged::before {
    content: '';
    position: absolute;
    top: -15px;
    bottom: -15px;
    left: 0;
    right: 0;
  }
</style>