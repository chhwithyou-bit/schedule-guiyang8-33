<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { activeTheme } from '../../stores/theme';
  import { themeInitialized } from '../../stores/appState';

  let showPanel = false;
  let overlayRef: HTMLElement;
  let transitionCircleRef: HTMLElement;
  let circleColor = '#111';

  const themes = [
    { id: 'theme-default', name: 'Default', primary: '#111', bg: '#fff' },
    { id: 'theme-a', name: 'Bamboo & Azure', primary: '#6FC994', bg: '#f0f9f4' },
    { id: 'theme-b', name: 'Ink & Peach', primary: '#FAC7B7', bg: '#fdf6f3' },
    { id: 'theme-c', name: 'Teal & Vermillion', primary: '#0F6059', bg: '#faf6f0' }
  ];

  onMount(() => {
    // Check local storage for existing theme
    const savedTheme = localStorage.getItem('siteTheme');
    if (savedTheme) {
      activeTheme.set(savedTheme);
      themeInitialized.set(true);
    } else {
      // Show full-screen panel on first visit
      showPanel = true;
    }
  });

  async function applyTheme(themeObj: typeof themes[0]) {
    circleColor = themeObj.primary;
    
    // Circle Expand Transition
    await gsap.fromTo(transitionCircleRef,
      { scale: 0, opacity: 1 },
      { scale: 3, duration: 0.3, ease: 'power2.inOut' }
    );

    // Apply CSS Variables implicitly by updating active theme
    activeTheme.set(themeObj.id);
    localStorage.setItem('siteTheme', themeObj.id);
    
    if (showPanel) {
      // Fade out panel if it was the first visit
      gsap.to(overlayRef, { opacity: 0, duration: 0.3, onComplete: () => {
        showPanel = false;
        themeInitialized.set(true);
      }});
    }

    // Circle Collapse Transition
    gsap.to(transitionCircleRef, {
      scale: 0, duration: 0.3, ease: 'power2.inOut', delay: 0.1
    });
  }
</script>

<!-- Persistent Compact Switcher (Top Right) -->
{#if $themeInitialized && !showPanel}
  <div class="fixed top-5 right-5 z-[8000] flex gap-2 p-2 bg-white/50 dark:bg-black/50 backdrop-blur-md rounded-full shadow-sm">
    {#each themes as theme}
      <button 
        class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-125"
        style="background-color: {theme.primary}; border-color: {$activeTheme === theme.id ? theme.bg : 'transparent'};"
        on:click={() => applyTheme(theme)}
        aria-label="Switch to {theme.name}"
      ></button>
    {/each}
  </div>
{/if}

<!-- First Visit Full-screen Panel -->
{#if showPanel}
  <div 
    bind:this={overlayRef}
    class="fixed inset-0 z-[9500] flex items-center justify-center bg-black/85 backdrop-blur-xl"
  >
    <div class="bg-white/10 p-8 rounded-3xl shadow-2xl max-w-lg w-full text-center text-white border border-white/20">
      <h2 class="text-3xl font-black mb-2 tracking-tighter">Choose Your Vibe</h2>
      <p class="text-white/60 mb-8 font-medium">Select a color palette to begin your experience.</p>
      
      <div class="grid grid-cols-2 gap-4">
        {#each themes as theme}
          <button 
            class="flex flex-col items-center p-4 rounded-2xl hover:bg-white/10 transition-colors group"
            on:click={() => applyTheme(theme)}
          >
            <div class="w-16 h-16 rounded-full mb-3 shadow-inner group-hover:scale-110 transition-transform" style="background-color: {theme.primary}; border: 4px solid {theme.bg}"></div>
            <span class="font-bold text-sm tracking-wide">{theme.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Thematic Circle Transition Overlay -->
<!-- scale-0 by default, scaled via GSAP -->
<div 
  bind:this={transitionCircleRef}
  class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] rounded-full z-[9900] pointer-events-none scale-0"
  style="background-color: {circleColor};"
></div>

<style>
  /* Ensure no pointer events interrupt while transition circle is expanding */
</style>