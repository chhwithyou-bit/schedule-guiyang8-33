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
  import CommunityConsole from './components/modals/CommunityConsole.svelte';

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
  let mainContent: HTMLElement;
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
        x: -56,
        y: -28,
        scale: 0.88,
        rotate: -5,
        opacity: 0,
        duration: 1.15,
        ease: "expo.out",
        transformOrigin: "top left"
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
  class="app-container font-sans text-[var(--color-text)] min-h-screen relative overflow-hidden selection:bg-[var(--color-primary)] selection:text-[var(--color-button-text)]"
>
  <div class="app-background" aria-hidden="true"></div>

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
    <main class="view-wrapper pt-40 pb-40 px-6 md:px-12 md:pt-44 w-full max-w-7xl mx-auto">
      <PageTransition url={$currentView}>
        <svelte:component this={viewMap[$currentView]} />
      </PageTransition>
    </main>
  </div>

  {#if !isLoading && $themeInitialized}
    <CustomCursor />
    <Header />
    <MusicPlayer />
    <LiquidBar class="liquid-bar-dock" />
  {/if}

  {#if $activeModal === 'auth'}
    <AuthModal />
  {:else if $activeModal === 'community-console'}
    <CommunityConsole />
  {:else if $activeModal === 'comm-post'}
    <PostModal />
  {/if}
</div>

<style>
  .app-container {
    background:
      radial-gradient(circle at 14% 8%, rgba(var(--glow-primary-rgb), 0.14), transparent 26%),
      radial-gradient(circle at 86% 14%, rgba(var(--glow-secondary-rgb), 0.16), transparent 28%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 14%);
  }

  .app-container::before,
  .app-container::after {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }

  .app-background {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .app-background::before,
  .app-background::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/IMG_1695.jpeg');
    background-repeat: no-repeat;
    background-position: center top;
  }

  .app-background::before {
    background-size: cover;
  }

  .app-background::after {
    display: none;
  }

  .app-container::before {
    background:
      radial-gradient(circle at 12% 18%, rgba(var(--glow-primary-rgb), 0.16), transparent 24%),
      radial-gradient(circle at 84% 12%, rgba(var(--glow-secondary-rgb), 0.18), transparent 28%);
    background-position: 12% 18%, 84% 12%;
    background-size: auto, auto;
    background-repeat: no-repeat;
    opacity: 0.92;
  }

  .app-container::after {
    background:
      linear-gradient(115deg, rgba(255, 255, 255, 0.05), transparent 28%),
      linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.18) 100%);
    opacity: 0.72;
  }

  @media (max-width: 768px) {
    .app-background::before {
      background-position: center top;
    }

    .app-container::before {
      background-position: 18% 10%, 82% 12%;
    }
  }

  .main-content-assembly {
    position: relative;
    z-index: 2;
    transition: opacity 1.4s ease-out;
  }

  :global(body.modal-open) {
    overflow: hidden !important;
  }
</style>
