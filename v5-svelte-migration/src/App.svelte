<script lang="ts">
  /**
   * 8Community V5 - Liquid Evolution
   * Updated: 2026-03-29
   */
  import { onMount, tick } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
  import Lenis from '@studio-freight/lenis';
  import { currentView, themeInitialized } from './stores/appState';
  import { activeTheme } from './stores/theme';
  import { activeModal } from './stores/modalState';

  import CustomCursor from './components/ui/CustomCursor.svelte';
  import Preloader from './components/ui/Preloader.svelte';
  import ThemeSwitcher from './components/ui/ThemeSwitcher.svelte';
  import Header from './components/layout/Header.svelte';
  import PageTransition from './components/layout/PageTransition.svelte';
  import LiquidBar from './components/layout/LiquidBar.svelte';
  import MusicPlayer from './components/layout/MusicPlayer.svelte';

  // Modals
  import AuthModal from './components/modals/AuthModal.svelte';
  import PostModal from './components/modals/PostModal.svelte';

  import ScheduleView from './components/views/ScheduleView.svelte';
  import CommunityView from './components/views/CommunityView.svelte';
  import NodesView from './components/views/NodesView.svelte';
  import XiangqiView from './components/views/XiangqiView.svelte';
  import AdminView from './components/views/AdminView.svelte';

  try {
    gsap.registerPlugin(ScrollTrigger);
  } catch (e) {
    console.warn('GSAP ScrollTrigger registration failed:', e);
  }

  let lenis: Lenis;
  let viewContainer: HTMLElement;
  let mainContent: HTMLElement;
  let isTransitioning = false;
  let isLoading = true;

  const viewMap: Record<string, any> = {
    schedule: ScheduleView,
    community: CommunityView,
    nodes: NodesView,
    xiangqi: XiangqiView,
    admin: AdminView
  };

  /**
   * PHASE 3: THE ASSEMBLY
   * Hand-off animation once Preloader hits 100%
   */
  async function startAssembly() {
    isLoading = false;
    await tick();
    
    if (!mainContent) return;

    try {
      const tl = gsap.timeline();

      // 1. Background focus
      tl.fromTo(mainContent, 
        { opacity: 0 },
        { opacity: 1, duration: 1.4, ease: "expo.out" }
      );

      // 2. 3D Fly-in for main components
      tl.from(".view-wrapper", {
        y: 40,
        opacity: 0,
        duration: 1.6,
        ease: "power3.out"
      }, "-=1.2");

      // 3. Elements rising from water
      tl.from(".liquid-bar-dock", {
        y: 150,
        opacity: 0,
        duration: 1.2,
        ease: "elastic.out(1, 0.7)"
      }, "-=1.4");

      tl.from("header", {
        y: -80,
        opacity: 0,
        duration: 1.0,
        ease: "power3.out"
      }, "-=1.4");
    } catch (e) {
      console.error('Assembly animation failed, forcing visibility:', e);
      if (mainContent) mainContent.style.opacity = '1';
    }
  }

  onMount(() => {
    // Fail-safe: Force show app after 5 seconds if stuck
    const failSafe = setTimeout(() => {
      if (isLoading) {
        console.warn('App stuck loading, triggering fail-safe...');
        themeInitialized.set(true);
        startAssembly();
      }
    }, 5000);

    try {
      // Initialize smooth scrolling with Lenis
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), 
        smoothWheel: true
      });

      const raf = (time: number) => {
        if (lenis) {
          lenis.raf(time);
          ScrollTrigger.update();
          requestAnimationFrame(raf);
        }
      };
      requestAnimationFrame(raf);
    } catch (e) {
      console.warn('Lenis initialization failed:', e);
    }

    return () => {
      clearTimeout(failSafe);
      if (lenis) {
        try { lenis.destroy(); } catch(e) {}
      }
    };
  });
</script>

<div 
  class="app-container font-sans bg-[var(--color-bg)] text-[var(--color-text)] min-h-screen relative selection:bg-[var(--color-primary)] selection:text-white" 
  data-theme={$activeTheme}
  style="perspective: 1200px;"
>
  <!-- ThemeSwitcher rendered first to manage initial theme setup -->
  <ThemeSwitcher />

  <!-- The Preloader must always be mounted initially so it can track theme initialization via its own internal logic -->
  {#if isLoading}
    <Preloader on:complete={startAssembly} />
  {/if}

  <!-- Only show content when fully loaded and theme is ready -->
  <div 
    bind:this={mainContent} 
    class="main-content-assembly {(isLoading || !$themeInitialized) ? 'opacity-0' : 'opacity-100'}"
  >
    <CustomCursor />
    <Header />
    
    <main bind:this={viewContainer} class="view-wrapper pt-32 pb-40 px-6 md:px-12 w-full max-w-7xl mx-auto">
      <PageTransition url={$currentView}>
        <svelte:component this={viewMap[$currentView]} />
      </PageTransition>
    </main>

    <MusicPlayer />
    <LiquidBar class="liquid-bar-dock" />
  </div>

  {#if $activeModal === 'auth'}
    <AuthModal />
  {:else if $activeModal === 'comm-post'}
    <PostModal />
  {/if}
</div>

<style>
  .main-content-assembly {
    /* Add a transition so the opacity change is smooth even if GSAP is not used */
    transition: opacity 1.4s ease-out;
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
