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
  import PageTransition from './components/layout/PageTransition.svelte';
  import LiquidBar from './components/layout/LiquidBar.svelte';
  import MusicPlayer from './components/layout/MusicPlayer.svelte';

  import ScheduleView from './components/views/ScheduleView.svelte';
  import CommunityView from './components/views/CommunityView.svelte';
  import NodesView from './components/views/NodesView.svelte';

  gsap.registerPlugin(ScrollTrigger);

  let lenis: Lenis;
  let viewContainer: HTMLElement;
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
  class="app-container font-sans bg-[var(--color-bg)] text-[var(--color-text)] min-h-screen transition-colors duration-500 relative selection:bg-[var(--color-primary)] selection:text-white" 
  data-theme={$activeTheme}
>
  {#if !$themeInitialized}
    <LoadingScreen />
  {:else}
    <CustomCursor />
    <Header />
    <ThemeSwitcher />
    
    <main bind:this={viewContainer} class="view-wrapper pt-32 pb-40 px-6 md:px-12 w-full max-w-7xl mx-auto">
      <PageTransition url={$currentView}>
        <svelte:component this={viewMap[$currentView]} />
      </PageTransition>
    </main>

    <MusicPlayer />
    <LiquidBar />
  {/if}
</div>

<style>
  :global(:root) {
    --color-primary: #111;
    --color-accent: #ff7710;
    --color-bg: #fff;
    --color-text: #000;
  }

  :global([data-theme="theme-a"]) {
    --color-primary: #6FC994;
    --color-bg: #f0f9f4;
    --color-text: #1a2e21;
  }

  :global([data-theme="theme-b"]) {
    --color-primary: #FAC7B7;
    --color-bg: #fdf6f3;
    --color-text: #2e1a1a;
  }

  :global([data-theme="theme-c"]) {
    --color-primary: #0F6059;
    --color-bg: #faf6f0;
    --color-text: #0a2e2b;
  }
  
  :global(body.modal-open) {
    overflow: hidden !important;
  }
</style>
