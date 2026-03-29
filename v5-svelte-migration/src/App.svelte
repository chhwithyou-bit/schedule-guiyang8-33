<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
  import Lenis from '@studio-freight/lenis';
  import { currentView, themeInitialized } from './stores/appState';
  import { activeTheme } from './stores/theme';

  import CustomCursor from './components/ui/CustomCursor.svelte';
  import Preloader from './components/ui/Preloader.svelte';
  import ThemeSwitcher from './components/ui/ThemeSwitcher.svelte';
  import Header from './components/layout/Header.svelte';
  import PageTransition from './components/layout/PageTransition.svelte';
  import LiquidBar from './components/layout/LiquidBar.svelte';
  import MusicPlayer from './components/layout/MusicPlayer.svelte';

  import ScheduleView from './components/views/ScheduleView.svelte';
  import CommunityView from './components/views/CommunityView.svelte';
  import NodesView from './components/views/NodesView.svelte';

  gsap.registerPlugin(ScrollTrigger);

  let lenis: Lenis;
  let viewContainer: HTMLElement;
  let mainContent: HTMLElement;
  let isTransitioning = false;
  let isLoading = true;

  const viewMap: Record<string, any> = {
    schedule: ScheduleView,
    community: CommunityView,
    nodes: NodesView
  };

  /**
   * PHASE 3: THE ASSEMBLY
   * Hand-off animation once Preloader hits 100%
   */
  async function startAssembly() {
    isLoading = false;
    await tick();
    
    const tl = gsap.timeline();

    // 1. Background focus & scale
    tl.fromTo(mainContent, 
      { filter: "blur(30px)", opacity: 0, scale: 0.95 },
      { filter: "blur(0px)", opacity: 1, scale: 1, duration: 1.4, ease: "expo.out" }
    );

    // 2. 3D Fly-in for main components (staggered)
    tl.from(".view-wrapper h1, .view-wrapper p, .view-wrapper article, .view-wrapper .schedule-view > div", {
      z: -180,
      y: 100,
      rotateX: -15,
      opacity: 0,
      duration: 1.6,
      stagger: 0.08,
      ease: "elastic.out(1, 0.75)"
    }, "-=0.9");

    // 3. Elements rising from water
    tl.from(".liquid-bar-dock", {
      y: 150,
      opacity: 0,
      duration: 1.2,
      ease: "back.out(1.7)"
    }, "-=1.2");

    tl.from("header", {
      y: -80,
      opacity: 0,
      duration: 1.0,
      ease: "power3.out"
    }, "-=1.4");
  }

  onMount(() => {
    // Initialize smooth scrolling with Lenis
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), 
      smoothWheel: true
    });

    function raf(time: number) {
      lenis.raf(time);
      ScrollTrigger.update();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  });
</script>

<div 
  class="app-container font-sans bg-[var(--color-bg)] text-[var(--color-text)] min-h-screen relative selection:bg-[var(--color-primary)] selection:text-white" 
  data-theme={$activeTheme}
  style="perspective: 1200px;"
>
  {#if isLoading}
    <Preloader on:complete={startAssembly} />
  {/if}

  <div 
    bind:this={mainContent} 
    class="main-content-assembly {isLoading ? 'opacity-0' : 'opacity-100'}"
  >
    <CustomCursor />
    <Header />
    <ThemeSwitcher />
    
    <main bind:this={viewContainer} class="view-wrapper pt-32 pb-40 px-6 md:px-12 w-full max-w-7xl mx-auto">
      <PageTransition url={$currentView}>
        <svelte:component this={viewMap[$currentView]} />
      </PageTransition>
    </main>

    <MusicPlayer />
    <LiquidBar class="liquid-bar-dock" />
  </div>
</div>

<style>
  .main-content-assembly {
    transform-style: preserve-3d;
    will-change: filter, transform, opacity;
  }
  
  :global(:root) {
    --color-primary: #f5efe0;
    --color-accent: #3a3d5e;
    --color-bg: #020029;
    --color-text: #f5efe0;
  }

  :global([data-theme="theme-spring"]) {
    --color-primary: #85B581;
    --color-accent: #598F56;
    --color-bg: #EAF4E8;
    --color-text: #1a2e21;
  }

  :global([data-theme="theme-summer"]) {
    --color-primary: #B29BCE;
    --color-accent: #8E6FB8;
    --color-bg: #F4F1F9;
    --color-text: #2e1a1a;
  }

  :global([data-theme="theme-autumn"]) {
    --color-primary: #D17F71;
    --color-accent: #B85343;
    --color-bg: #F9EDE9;
    --color-text: #0a2e2b;
  }
  
  :global(body.modal-open) {
    overflow: hidden !important;
  }
</style>
