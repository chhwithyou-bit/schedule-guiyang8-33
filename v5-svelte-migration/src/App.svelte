<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
  import Lenis from '@studio-freight/lenis';
  import { currentView, themeInitialized } from './stores/appState';
  import { activeTheme } from './stores/theme';

  import CustomCursor from './components/ui/CustomCursor.svelte';
  import LoadingScreen from './components/ui/LoadingScreen.svelte';
  import ThemeSwitcher from './components/ui/ThemeSwitcher.svelte';
  import Header from './components/layout/Header.svelte';
  import LiquidBar from './components/layout/LiquidBar.svelte';

  import ScheduleView from './components/views/ScheduleView.svelte';
  import CommunityView from './components/views/CommunityView.svelte';
  import NodesView from './components/views/NodesView.svelte';

  gsap.registerPlugin(ScrollTrigger);

  let lenis: Lenis;
  let viewContainer: HTMLElement;
  let curtainBlock: HTMLElement;
  let isTransitioning = false;

  const viewMap: Record<string, any> = {
    schedule: ScheduleView,
    community: CommunityView,
    nodes: NodesView
  };

  onMount(() => {
    // Initialize smooth scrolling with Lenis
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential out
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1
    });

    function raf(time: number) {
      lenis.raf(time);
      ScrollTrigger.update();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Sync GSAP with Lenis
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf);
    };
  });

  // Handle curtain wipe view transitions
  $: if ($currentView) {
    if ($themeInitialized && !isTransitioning) {
      triggerCurtainWipe();
    }
  }

  async function triggerCurtainWipe() {
    isTransitioning = true;
    
    // 1. Color block sweeps in from left
    await gsap.fromTo(curtainBlock, 
      { scaleX: 0, transformOrigin: 'left center' }, 
      { scaleX: 1, duration: 0.2, ease: 'power2.inOut' }
    );
    
    // 2. Await tick for Svelte DOM to theoretically update, though store bindings handle it
    await tick();
    window.scrollTo(0, 0); // Reset scroll on view change

    // 3. Block sweeps out to right
    gsap.to(curtainBlock, { 
      scaleX: 0, 
      transformOrigin: 'right center', 
      duration: 0.3, 
      ease: 'power2.inOut',
      onComplete: () => { isTransitioning = false; }
    });
  }
</script>

<svelte:head>
  <!-- FOUC prevention logic injected in root index.html, handled here logically via activeTheme store -->
</svelte:head>

<div class="app-container font-sans bg-[var(--color-bg)] text-[var(--color-text)] min-h-screen transition-colors duration-300 relative" data-theme={$activeTheme}>
  
  {#if !$themeInitialized}
    <LoadingScreen />
  {:else}
    <CustomCursor />
    <Header />
    <ThemeSwitcher />

    <!-- Main View Content wrapped in accessible main tag -->
    <main bind:this={viewContainer} class="view-wrapper pt-24 pb-32 px-4 md:px-12 w-full max-w-7xl mx-auto min-h-screen">
      <!-- Svelte Dynamic Component rendering -->
      <svelte:component this={viewMap[$currentView]} />
    </main>

    <LiquidBar />
  {/if}

  <!-- Global Curtain Wipe Element for Page Transitions -->
  <div bind:this={curtainBlock} class="fixed inset-0 z-[9000] bg-[var(--color-primary)] scale-x-0 origin-left pointer-events-none"></div>
</div>

<style>
  /* Global Resets & Typography overrides for jiejoe.com style minimalism */
  :global(:root) {
    --color-primary: #111;
    --color-bg: #fff;
    --color-text: #000;
  }
  
  /* Prevent scroll bleed globally when a modal class is added to body */
  :global(body.modal-open) {
    overflow: hidden !important;
  }
  
  .app-container {
    overflow-x: hidden;
  }
</style>