<script>
  import { onMount, tick } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import Lenis from '@studio-freight/lenis';

  // Component Imports (Mocked paths for proposal)
  import LoadingScreen from './components/global/LoadingScreen.svelte';
  import ThemeSwitcher from './components/global/ThemeSwitcher.svelte';
  import CustomCursor from './components/global/CustomCursor.svelte';
  import LiquidHub from './components/layout/LiquidHub.svelte';
  import MusicPlayer from './components/layout/MusicPlayer.svelte';

  // View Imports
  import ScheduleView from './components/views/Schedule/ScheduleView.svelte';
  import CommunityView from './components/views/Community/CommunityView.svelte';
  import NodesView from './components/views/Nodes/NodesView.svelte';
  import XiangqiView from './components/views/Xiangqi/XiangqiView.svelte';

  gsap.registerPlugin(ScrollTrigger);

  // Global State
  let isLoading = true;
  let currentRoute = 'schedule';
  let nextRoute = null;
  let isModalOpen = false; // Bound to global store in real app to prevent scroll bleed

  // Refs
  let curtainRef;
  let lenis;

  onMount(() => {
    // 1. Initialize Lenis for smooth scrolling
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential out
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      mouseMultiplier: 1,
      smoothTouch: false,
      touchMultiplier: 2,
      infinite: false,
    });

    // Synchronize Lenis with GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });

    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf);
    };
  });

  // Strict Scroll Bleed Prevention
  $: {
    if (typeof document !== 'undefined') {
      if (isModalOpen) {
        document.body.style.overflow = 'hidden';
        lenis?.stop(); // Pause lenis scrolling
      } else {
        document.body.style.overflow = '';
        lenis?.start(); // Resume lenis scrolling
      }
    }
  }

  // Page Transition: Curtain Wipe
  async function navigateTo(route) {
    if (route === currentRoute || isTransitioning) return;
    isTransitioning = true;
    nextRoute = route;

    // Phase 1: Sweep in from left
    gsap.set(curtainRef, { transformOrigin: 'left center' });
    await gsap.to(curtainRef, {
      scaleX: 1,
      duration: 0.2,
      ease: 'power2.inOut'
    });

    // Phase 2: Change actual Svelte view
    currentRoute = nextRoute;
    nextRoute = null;
    lenis?.scrollTo(0, { immediate: true }); // Reset scroll position
    await tick(); // Wait for DOM to update

    // Phase 3: Sweep out to right
    gsap.set(curtainRef, { transformOrigin: 'right center' });
    await gsap.to(curtainRef, {
      scaleX: 0,
      duration: 0.3,
      ease: 'power2.inOut'
    });

    isTransitioning = false;
  }

  let isTransitioning = false;

  function handleLoadingComplete() {
    isLoading = false;
  }
</script>

<!-- Global Accessibility: Reduced motion check -->
<svelte:window
  on:keydown={(e) => {
    // Global keydown listeners if needed
  }}
/>

<CustomCursor />

{#if isLoading}
  <LoadingScreen on:complete={handleLoadingComplete} />
{/if}

<ThemeSwitcher />

<!-- Page Transition Curtain -->
<div
  bind:this={curtainRef}
  class="fixed inset-0 z-[9998] bg-[var(--color-primary)] scale-x-0 pointer-events-none origin-left"
></div>

<!-- Main Application Layout -->
<div class="relative min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] selection:bg-[var(--color-primary)] selection:text-[var(--color-bg)] transition-colors duration-300">

  <!-- Content Area Wrapper -->
  <main class="relative z-10 pb-32" class:overflow-hidden={isModalOpen}>
    {#if currentRoute === 'schedule'}
      <ScheduleView />
    {:else if currentRoute === 'community'}
      <CommunityView />
    {:else if currentRoute === 'nodes'}
      <NodesView />
    {:else if currentRoute === 'xiangqi'}
      <XiangqiView />
    {/if}
  </main>

  <!-- Centralized Z-Axis Controls: LiquidHub & MusicPlayer -->
  <!-- Resolving spatial conflicts by stacking them carefully -->
  <aside class="fixed bottom-0 left-0 w-full z-40 pointer-events-none">
    <div class="container mx-auto max-w-4xl relative pointer-events-auto flex flex-col items-center">

      <!-- Music Player sits just above the Liquid Hub -->
      <MusicPlayer />

      <!-- Unified Navigation replaces Drawer & old Dock -->
      <LiquidHub
        {currentRoute}
        onNavigate={(e) => navigateTo(e.detail.route)}
      />

    </div>
  </aside>

</div>

<style>
  /*
    Tailwind handles most layout, but custom properties
    and specific overrides can live here.
  */
  :global(:root) {
    /* Fallback default theme, usually injected in <head> to prevent FOUC */
    --color-primary: #1a1a1a;
    --color-bg: #ffffff;
    --color-text: #1a1a1a;
  }

  /* Ensure Lenis has correct baseline styles */
  :global(html.lenis), :global(html.lenis body) {
    height: auto;
  }
  :global(.lenis.lenis-smooth) {
    scroll-behavior: auto !important;
  }
</style>
