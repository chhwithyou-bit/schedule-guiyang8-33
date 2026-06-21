<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';

  import { activeModal } from './stores/modalState';
  import { clearSelectedProfile, currentView, selectedProfile, themeInitialized } from './stores/appState';
  import { applyTheme } from './stores/theme';

  import Header from './components/layout/Header.svelte';
  import LiquidBar from './components/layout/LiquidBar.svelte';
  import PageTransition from './components/layout/PageTransition.svelte';
  import AuthModal from './components/modals/AuthModal.svelte';
  import PostModal from './components/modals/PostModal.svelte';
  import AdminView from './components/views/AdminView.svelte';
  import CommunityView from './components/views/CommunityView.svelte';
  import ProfileView from './components/views/ProfileView.svelte';
  import CommunityConsole from './components/modals/CommunityConsole.svelte';
  import ImageViewer from './components/modals/ImageViewer.svelte';
  import { installAppRouter } from './lib/appRouter';

  let mainContent: HTMLElement;
  let modalRegion: HTMLElement | null = null;
  let previousModalId: string | null = null;
  let previousView = '';

  const viewMap: Record<string, any> = {
    community: CommunityView,
    profile: ProfileView,
    admin: AdminView
  };

  function handleGlobalKeydown(event: KeyboardEvent) {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;

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
    if (!modalId || event.key !== 'Tab' || !modalRegion) return;

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

  function syncModalViewport() {
    if (typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty('--app-modal-viewport-height', `${Math.round(height)}px`);
    rootStyle.setProperty('--app-modal-viewport-top', `${Math.round(top)}px`);
  }

  function getModalViewportBounds() {
    const rootStyle = getComputedStyle(document.documentElement);
    const height = Number.parseFloat(rootStyle.getPropertyValue('--app-modal-viewport-height')) || window.visualViewport?.height || window.innerHeight;
    const top = Number.parseFloat(rootStyle.getPropertyValue('--app-modal-viewport-top')) || window.visualViewport?.offsetTop || 0;

    return {
      top,
      bottom: top + height
    };
  }

  function isKeyboardTextField(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    if (element instanceof HTMLTextAreaElement) return true;
    if (!(element instanceof HTMLInputElement)) return false;

    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
  }

  function findScrollParent(element: HTMLElement) {
    let current = element.parentElement;

    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      const canScroll = /(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`);
      if (canScroll && current.scrollHeight > current.clientHeight) return current;
      current = current.parentElement;
    }

    return null;
  }

  function keepFocusedInputAboveKeyboard() {
    const active = document.activeElement;
    if (!isKeyboardTextField(active)) return;

    requestAnimationFrame(() => {
      const bounds = getModalViewportBounds();
      const margin = 18;
      const rect = active.getBoundingClientRect();

      if (rect.bottom <= bounds.bottom - margin && rect.top >= bounds.top + margin) return;

      const scrollParent = findScrollParent(active);
      const delta = rect.bottom - (bounds.bottom - margin);

      if (scrollParent && delta > 0) {
        scrollParent.scrollBy({ top: delta, behavior: 'auto' });
        return;
      }

      if (delta > 0) {
        window.scrollBy({ top: delta, behavior: 'auto' });
      }
    });
  }

  function handleViewportChange() {
    syncModalViewport();
    keepFocusedInputAboveKeyboard();
  }

  function syncModalAccessibility(modalId: string | null) {
    if (typeof document === 'undefined' || !mainContent) return;

    if (modalId) {
      mainContent.setAttribute('aria-hidden', 'true');
      document.body.classList.add('modal-open');
      syncModalViewport();
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
    if (previousView === 'community' && nextView !== previousView && nextView !== 'profile' && $selectedProfile) {
      clearSelectedProfile();
    }
    previousView = nextView;
  }

  onMount(() => {
    applyTheme('theme-default');
    themeInitialized.set(true);

    const uninstallAppRouter = installAppRouter();
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('keydown', handleModalFocus);
    window.addEventListener('focusin', keepFocusedInputAboveKeyboard);
    window.addEventListener('resize', syncModalViewport);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    syncModalViewport();

    return () => {
      uninstallAppRouter();
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('keydown', handleModalFocus);
      window.removeEventListener('focusin', keepFocusedInputAboveKeyboard);
      window.removeEventListener('resize', syncModalViewport);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  });
</script>

<div class="app-container min-h-screen selection:bg-[var(--clay-light)] selection:text-[var(--ink)]">
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <div class="app-background is-ready" aria-hidden="true"></div>

  <Header />
  <LiquidBar class="liquid-bar-dock" />

  <div bind:this={mainContent} class="main-content-assembly">
    <main id="main-content" tabindex="-1" class="view-wrapper mx-auto w-full max-w-[1280px] px-6 pb-40 pt-32 md:px-10 md:pb-44 md:pt-36">
      <PageTransition url={$currentView}>
        <svelte:component this={viewMap[$currentView]} />
      </PageTransition>
    </main>
  </div>

  {#if $activeModal === 'auth'}
    <AuthModal />
  {:else if $activeModal === 'comm-post'}
    <PostModal />
  {:else if $activeModal === 'console'}
    <CommunityConsole openAsModal={true} />
  {/if}

  <ImageViewer />
</div>

<style>
  .app-container {
    position: relative;
    overflow-x: hidden;
    background:
      linear-gradient(180deg, rgba(250, 249, 245, 0.52), rgba(240, 238, 230, 0.9)),
      var(--paper);
    color: var(--ink);
    font-family: var(--serif);
  }

  .app-background {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(250, 249, 245, 0.66), rgba(240, 238, 230, 0.94)),
      var(--paper);
  }

  .app-background::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.33;
    background-image:
      linear-gradient(rgba(25, 25, 25, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(25, 25, 25, 0.018) 1px, transparent 1px);
    background-size: 32px 32px;
    mask-image: linear-gradient(180deg, black, transparent 82%);
  }

  .main-content-assembly {
    position: relative;
    z-index: 2;
  }

  .skip-link {
    position: fixed;
    left: 1rem;
    top: 1rem;
    z-index: 7000;
    border-radius: var(--r-btn);
    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0;
    padding: 0.65rem 0.85rem;
    pointer-events: none;
    transform: translateY(-0.5rem);
    transition: opacity 160ms ease, transform 160ms ease;
  }

  .skip-link:focus {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  :global(body.modal-open) {
    overflow: hidden !important;
    overscroll-behavior: contain;
  }

  @media (max-width: 640px) {
    .view-wrapper {
      padding-top: 6.5rem;
    }
  }
</style>
