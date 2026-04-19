<script lang="ts">
  /**
   * 8Community V5 - Liquid Evolution
   * Updated: 2026-03-29
   */
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { gsap } from 'gsap';
  import Lenis from '@studio-freight/lenis';
  import { currentView, selectedProfile, themeInitialized, clearSelectedProfile } from './stores/appState';
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
  import ConsoleView from './components/views/ConsoleView.svelte';
  import NodesView from './components/views/NodesView.svelte';
  import XiangqiView from './components/views/XiangqiView.svelte';
  import AdminView from './components/views/AdminView.svelte';

  let lenis: Lenis;
  let lenisFrame = 0;
  let mainContent: HTMLElement;
  let modalRegion: HTMLElement | null = null;
  let previousModalId: string | null = null;
  let isLoading = true;
  let lenisStarted = false;
  let backgroundReady = false;
  let backgroundFailed = false;
  let canFinishLoading = false;

  const WALLPAPER_SRC = '/IMG_1695.webp';

  const viewMap: Record<string, any> = {
    schedule: ScheduleView,
    community: CommunityView,
    console: ConsoleView,
    nodes: NodesView,
    xiangqi: XiangqiView,
    admin: AdminView
  };

  function startLenis() {
    if (lenisStarted) return;
    lenisStarted = true;

    try {
      lenis = new Lenis({
        duration: 0.82,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
        wheelMultiplier: 0.92,
        touchMultiplier: 0.95
      });

      const raf = (time: number) => {
        if (!lenis) return;
        lenis.raf(time);
        lenisFrame = requestAnimationFrame(raf);
      };

      lenisFrame = requestAnimationFrame(raf);
    } catch (e) {
      console.warn('Lenis initialization failed:', e);
    }
  }

  function preloadWallpaper() {
    if (backgroundReady || backgroundFailed) return;

    const img = new Image();
    img.src = WALLPAPER_SRC;

    const markReady = () => {
      backgroundReady = true;
    };

    const markFailed = () => {
      backgroundFailed = true;
    };

    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch (e) {}

      markReady();
    };

    img.onerror = () => {
      markFailed();
    };

    if (img.complete) {
      if (typeof img.decode === 'function') {
        void img.decode().catch(() => {}).finally(markReady);
      } else {
        markReady();
      }
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return;
    }

    if (event.key === 'Enter' && active.dataset.viewTrigger === 'true' && !event.defaultPrevented) {
      event.preventDefault();
      active.click();
    }
  }

  function collectFocusableElements(container: HTMLElement) {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
  }

  function handleModalFocus(event: KeyboardEvent) {
    const modalId = get(activeModal);
    if (!modalId || event.key !== 'Tab' || !modalRegion) {
      return;
    }

    const focusableElements = collectFocusableElements(modalRegion);
    if (focusableElements.length === 0) {
      event.preventDefault();
      modalRegion.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!current || current === firstElement || !modalRegion.contains(current)) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (!current || current === lastElement || !modalRegion.contains(current)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function syncModalAccessibility(modalId: string | null) {
    if (typeof document === 'undefined' || !mainContent) {
      return;
    }

    if (modalId) {
      mainContent.setAttribute('aria-hidden', 'true');
      document.body.classList.add('modal-open');
      return;
    }

    mainContent.removeAttribute('aria-hidden');
    document.body.classList.remove('modal-open');
    modalRegion = null;
  }

  async function focusModalShell() {
    await tick();
    await tick();

    requestAnimationFrame(() => {
      const shell = document.querySelector<HTMLElement>('[data-modal-shell="true"]');
      if (!shell) {
        return;
      }

      modalRegion = shell;
      const focusableElements = collectFocusableElements(shell);
      const initialFocusTarget = shell.querySelector<HTMLElement>('[data-modal-initial-focus="true"]');
      const target = initialFocusTarget || focusableElements[0] || shell;
      target.focus();

      requestAnimationFrame(() => {
        if (!shell.isConnected) {
          return;
        }

        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!active || active === target || shell.contains(active)) {
          return;
        }

        target.focus();
      });
    });
  }

  async function startAssembly() {
    if ((!$themeInitialized || !backgroundReady) && !backgroundFailed) return;

    isLoading = false;
    startLenis();
    await tick();

    if (!mainContent) return;

    try {
      gsap.set(mainContent, { opacity: 1 });

      const tl = gsap.timeline();

      tl.fromTo(
        mainContent,
        { opacity: 0.02, y: 8, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' }
      );

      tl.from(
        '.view-wrapper',
        {
          y: 26,
          opacity: 0,
          duration: 0.6,
          ease: 'power3.out',
          clearProps: 'transform,opacity'
        },
        '-=0.34'
      );

      tl.from(
        'header',
        {
          y: -22,
          opacity: 0,
          duration: 0.38,
          ease: 'power2.out',
          clearProps: 'transform,opacity'
        },
        '-=0.48'
      );

      tl.from(
        '.liquid-bar-dock',
        {
          x: -16,
          y: -12,
          scale: 0.985,
          filter: 'blur(10px)',
          opacity: 0,
          duration: 0.52,
          ease: 'power3.out',
          transformOrigin: 'top left',
          clearProps: 'transform,opacity,filter'
        },
        '-=0.42'
      );

      tl.from(
        '#mp',
        {
          y: 18,
          scale: 0.98,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
          clearProps: 'transform,opacity'
        },
        '-=0.34'
      );
    } catch (e) {
      console.error('Assembly animation failed, forcing visibility:', e);
      if (mainContent) mainContent.style.opacity = '1';
    }
  }

  $: canFinishLoading = $themeInitialized && (backgroundReady || backgroundFailed);

  let previousView = '';

  $: {
    const modalId = $activeModal;
    syncModalAccessibility(modalId);

    if (modalId && modalId !== previousModalId) {
      void focusModalShell();
    }

    previousModalId = modalId;
  }

  $: {
    const nextView = $currentView;

    if (previousView && nextView !== previousView && $selectedProfile) {
      clearSelectedProfile();
    }

    previousView = nextView;
  }

  onMount(() => {
    preloadWallpaper();

    const failSafe = setTimeout(() => {
      if (isLoading) {
        console.warn('App stuck loading, triggering fail-safe...');
        backgroundFailed = true;
        themeInitialized.set(true);
        startAssembly();
      }
    }, 5000);

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('keydown', handleModalFocus);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('keydown', handleModalFocus);
      clearTimeout(failSafe);
      if (lenisFrame) {
        cancelAnimationFrame(lenisFrame);
      }
      if (lenis) {
        try {
          lenis.destroy();
        } catch (e) {}
      }
    };
  });
</script>

<div
  class="app-container font-sans text-[var(--color-text)] min-h-screen relative overflow-hidden selection:bg-[var(--color-primary)] selection:text-[var(--color-button-text)]"
>
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <div class="app-background {backgroundReady ? 'is-ready' : ''}" aria-hidden="true"></div>

  <ThemeSwitcher />

  {#if isLoading}
    <Preloader canComplete={canFinishLoading} on:complete={startAssembly} />
  {/if}

  <div
    bind:this={mainContent}
    class="main-content-assembly {(isLoading || !$themeInitialized) ? 'opacity-0' : 'opacity-100'}"
  >
    <main id="main-content" tabindex="-1" class="view-wrapper pt-40 pb-40 px-6 md:px-12 md:pt-44 w-full max-w-7xl mx-auto">
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
  {:else if $activeModal === 'comm-post'}
    <PostModal />
  {:else if $activeModal === 'community-console'}
    <CommunityConsole openAsModal={true} />
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

  .app-background::before {
    opacity: 0;
    transition: opacity 280ms ease-out;
  }

  .app-background.is-ready::before {
    opacity: 1;
  }

  .app-background::before,
  .app-background::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/IMG_1695.webp');
    background-repeat: no-repeat;
    background-position: center -24px;
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
      background-position: center -16px;
    }

    .app-container::before {
      background-position: 18% 10%, 82% 12%;
    }
  }

  .skip-link {
    position: fixed;
    left: 1rem;
    top: 1rem;
    z-index: 7000;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-button-text);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    opacity: 0;
    padding: 0.85rem 1.2rem;
    pointer-events: none;
    text-transform: uppercase;
    transform: translateY(-0.5rem);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .skip-link:focus {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .main-content-assembly {
    position: relative;
    z-index: 2;
    transition: opacity 0.45s ease-out;
  }

  :global(body.modal-open) {
    overflow: hidden !important;
  }
</style>
