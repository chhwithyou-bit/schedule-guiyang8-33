<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { gsap } from 'gsap';
  import Lenis from '@studio-freight/lenis';

  import { activeModal } from './stores/modalState';
  import { clearSelectedProfile, currentView, selectedProfile, themeInitialized } from './stores/appState';

  import Header from './components/layout/Header.svelte';
  import LiquidBar from './components/layout/LiquidBar.svelte';
  import PageTransition from './components/layout/PageTransition.svelte';
  import AuthModal from './components/modals/AuthModal.svelte';
  import PostModal from './components/modals/PostModal.svelte';
  import CustomCursor from './components/ui/CustomCursor.svelte';
  import Preloader from './components/ui/Preloader.svelte';
  import ThemeSwitcher from './components/ui/ThemeSwitcher.svelte';
  import AdminView from './components/views/AdminView.svelte';
  import CommunityView from './components/views/CommunityView.svelte';
  import PersonalView from './components/views/PersonalView.svelte';
  import { installAppRouter } from './lib/appRouter';

  let lenis: Lenis;
  let lenisFrame = 0;
  let mainContent: HTMLElement;
  let modalRegion: HTMLElement | null = null;
  let previousModalId: string | null = null;
  let previousView = '';
  let isLoading = true;
  let lenisStarted = false;
  let backgroundReady = false;
  let backgroundFailed = false;
  let canFinishLoading = false;
  const ASSEMBLY_MOTION = {
    ease: 'expo.out',
    contentDuration: 0.72,
    surfaceDuration: 0.78
  } as const;

  const WALLPAPER_SRC = '/IMG_1695.webp';

  const viewMap: Record<string, any> = {
    community: CommunityView,
    profile: PersonalView,
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
    } catch (error) {
      console.warn('Lenis initialization failed:', error);
    }
  }

  function preloadWallpaper() {
    if (backgroundReady || backgroundFailed) return;

    const img = new Image();
    img.src = WALLPAPER_SRC;

    const markReady = () => {
      backgroundReady = true;
    };

    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch (error) {}

      markReady();
    };

    img.onerror = () => {
      backgroundFailed = true;
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

    const shell = document.querySelector<HTMLElement>('[data-modal-shell="true"]');
    if (!shell) return;

    modalRegion = shell;
    const focusableElements = collectFocusableElements(shell);
    const initialFocusTarget = shell.querySelector<HTMLElement>('[data-modal-initial-focus="true"]');
    (initialFocusTarget || focusableElements[0] || shell).focus();
  }

  async function startAssembly() {
    if ((!$themeInitialized || !backgroundReady) && !backgroundFailed) return;

    isLoading = false;
    startLenis();
    await tick();

    if (!mainContent) return;

    try {
      gsap.set(mainContent, { opacity: 1 });

      const timeline = gsap.timeline();
      timeline.fromTo(
        mainContent,
        { opacity: 0.02, y: 10, scale: 0.996, filter: 'blur(7px)' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: ASSEMBLY_MOTION.contentDuration,
          ease: ASSEMBLY_MOTION.ease
        }
      );
      timeline.from(
        '.view-wrapper',
        {
          y: 18,
          opacity: 0,
          filter: 'blur(5px)',
          duration: ASSEMBLY_MOTION.surfaceDuration,
          ease: ASSEMBLY_MOTION.ease,
          clearProps: 'transform,opacity,filter'
        },
        '-=0.34'
      );
      timeline.from(
        'header',
        {
          y: -14,
          opacity: 0,
          duration: 0.56,
          ease: ASSEMBLY_MOTION.ease,
          clearProps: 'transform,opacity'
        },
        '-=0.48'
      );
      timeline.from(
        '.liquid-bar-dock',
        {
          x: -10,
          y: -8,
          scale: 0.992,
          filter: 'blur(6px)',
          opacity: 0,
          duration: 0.7,
          ease: ASSEMBLY_MOTION.ease,
          transformOrigin: 'top left',
          clearProps: 'transform,opacity,filter'
        },
        '-=0.42'
      );
    } catch (error) {
      console.error('Assembly animation failed, forcing visibility:', error);
      if (mainContent) {
        mainContent.style.opacity = '1';
      }
    }
  }

  $: canFinishLoading = $themeInitialized && (backgroundReady || backgroundFailed);

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
    const uninstallAppRouter = installAppRouter();
    preloadWallpaper();

    const failSafe = setTimeout(() => {
      if (isLoading) {
        console.warn('App stuck loading, triggering fail-safe...');
        backgroundFailed = true;
        themeInitialized.set(true);
        void startAssembly();
      }
    }, 5000);

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('keydown', handleModalFocus);

    return () => {
      uninstallAppRouter();
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('keydown', handleModalFocus);
      clearTimeout(failSafe);
      if (lenisFrame) {
        cancelAnimationFrame(lenisFrame);
      }
      if (lenis) {
        try {
          lenis.destroy();
        } catch (error) {}
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
    <main id="main-content" tabindex="-1" class="view-wrapper mx-auto w-full max-w-7xl px-6 pb-56 pt-40 md:px-12 md:pb-40 md:pt-44">
      <PageTransition url={$currentView}>
        <svelte:component this={viewMap[$currentView]} />
      </PageTransition>
    </main>
  </div>

  {#if canFinishLoading}
    <Header />
    <LiquidBar class="liquid-bar-dock" />
  {/if}

  {#if !isLoading && $themeInitialized}
    <CustomCursor />
  {/if}

  {#if $activeModal === 'auth'}
    <AuthModal />
  {:else if $activeModal === 'comm-post'}
    <PostModal />
  {/if}
</div>

<style>
  .app-container {
    background-color: var(--color-bg);
    background:
      radial-gradient(circle at 12% 6%, rgba(var(--glow-primary-rgb), 0.08), transparent 28%),
      radial-gradient(circle at 88% 12%, rgba(var(--glow-secondary-rgb), 0.09), transparent 30%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 16%);
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
    background:
      radial-gradient(circle at 50% 18%, rgba(var(--glow-primary-rgb), 0.055), transparent 32%),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.28), rgba(var(--color-bg-rgb), 0.66));
  }

  .app-background::before {
    inset: -2.5rem;
    opacity: 0;
    filter: blur(30px) grayscale(0.04) saturate(1.08) contrast(0.96) brightness(0.48);
    transform: scale(1.08);
    transition: opacity var(--motion-duration-medium) var(--motion-ease-apple);
    will-change: opacity;
  }

  .app-background.is-ready::before {
    opacity: 0.42;
  }

  .app-background.is-ready::after {
    opacity: 0.86;
  }

  .app-background::before,
  .app-background::after {
    content: '';
    position: absolute;
    background-image: url('/IMG_1695.webp');
    background-repeat: no-repeat;
    background-position: center center;
  }

  .app-background::before {
    background-size: cover;
  }

  .app-background::after {
    inset: -0.75rem;
    opacity: 0;
    filter: grayscale(0.03) saturate(1.03) contrast(0.94) brightness(0.62);
    transition: opacity var(--motion-duration-medium) var(--motion-ease-apple);
    background:
      radial-gradient(circle at 48% 20%, rgba(var(--glow-primary-rgb), 0.055), transparent 24%),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.18) 0%, rgba(var(--color-bg-rgb), 0.38) 52%, rgba(var(--color-bg-rgb), 0.82) 100%),
      url('/IMG_1695.webp');
    background-repeat: no-repeat, no-repeat, no-repeat;
    background-position: center center, center center, center 50%;
    background-size: 100% 100%, 100% 100%, cover;
  }

  @media (min-width: 769px) {
    .app-background::before {
      inset: -4rem;
      filter: blur(42px) grayscale(0.04) saturate(1.08) contrast(0.96) brightness(0.5);
      transform: scale(1.14);
    }

    .app-background.is-ready::before {
      opacity: 0.64;
    }

    .app-background.is-ready::after {
      opacity: 0.84;
    }

    .app-background::after {
      inset: -1rem;
      transform: none;
      filter: grayscale(0.03) saturate(1.03) contrast(0.93) brightness(0.64);
      background:
        linear-gradient(90deg, rgba(var(--color-bg-rgb), 0.56) 0%, rgba(var(--color-bg-rgb), 0.16) 30%, rgba(var(--color-bg-rgb), 0.16) 68%, rgba(var(--color-bg-rgb), 0.62) 100%),
        linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.24) 0%, rgba(var(--color-bg-rgb), 0.12) 46%, rgba(var(--color-bg-rgb), 0.78) 100%),
        url('/IMG_1695.webp');
      background-repeat: no-repeat, no-repeat, no-repeat;
      background-position: center center, center center, center 30%;
      background-size: 100% 100%, 100% 100%, cover;
      mask-image: none;
    }
  }

  .app-container::before {
    background:
      radial-gradient(circle at 12% 18%, rgba(var(--glow-primary-rgb), 0.095), transparent 24%),
      radial-gradient(circle at 84% 12%, rgba(var(--glow-secondary-rgb), 0.1), transparent 28%);
    background-position: 12% 18%, 84% 12%;
    background-repeat: no-repeat;
    opacity: 0.92;
    animation: app-glow-drift 18s ease-in-out infinite alternate;
  }

  .app-container::after {
    background:
      linear-gradient(115deg, rgba(255, 255, 255, 0.026), transparent 28%),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.08) 0%, rgba(var(--color-bg-rgb), 0.52) 100%);
    opacity: 0.72;
    animation: app-veil-pulse 14s ease-in-out infinite alternate;
  }

  @media (max-width: 768px) {
    .app-background.is-ready::before {
      opacity: 0.28;
    }

    .app-background::after {
      background-position: center center, center center, center -16px;
      background-size: 100% 100%, 100% 100%, cover;
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
    transition:
      opacity var(--motion-duration-fast) var(--motion-ease-standard),
      transform var(--motion-duration-fast) var(--motion-ease-standard);
  }

  .skip-link:focus {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .main-content-assembly {
    position: relative;
    z-index: 2;
    transition: opacity var(--motion-duration-medium) var(--motion-ease-apple);
  }

  @keyframes app-background-float {
    from {
      transform: scale(1.02) translate3d(0, 0, 0);
    }

    to {
      transform: scale(1.055) translate3d(0, -1.1%, 0);
    }
  }

  @keyframes app-glow-drift {
    from {
      transform: translate3d(-1.5%, 0, 0) scale(1);
      opacity: 0.82;
    }

    to {
      transform: translate3d(1.8%, 1.8%, 0) scale(1.03);
      opacity: 1;
    }
  }

  @keyframes app-veil-pulse {
    from {
      opacity: 0.64;
      transform: translate3d(0, 0, 0);
    }

    to {
      opacity: 0.82;
      transform: translate3d(0, 1.4%, 0);
    }
  }

  :global(body.modal-open) {
    overflow: hidden !important;
  }
</style>
