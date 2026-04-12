<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import PageTransition from '$lib/ui/PageTransition.svelte';
  import {
    DEFAULT_THEME_ID,
    THEME_STORAGE_KEY,
    applyTheme,
    persistTheme,
    readStoredTheme,
    themeCatalog,
    type ThemeId
  } from '$lib/theme/themes';

  let { children } = $props<{ children?: import('svelte').Snippet }>();

  let isLoading = $state(true);
  let themeReady = $state(false);
  let backgroundReady = $state(false);
  let prefersReducedMotion = $state(false);
  let showThemePicker = $state(false);

  const WALLPAPER_SRC = '/IMG_1695.webp';

  function chooseTheme(themeId: ThemeId) {
    applyTheme(themeId);
    persistTheme(themeId);
    showThemePicker = false;
    themeReady = true;
  }

  function markReady() {
    backgroundReady = true;
    if (themeReady) {
      window.requestAnimationFrame(() => {
        isLoading = false;
      });
    }
  }

  onMount(() => {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme) {
      chooseTheme(readStoredTheme());
    } else {
      chooseTheme(DEFAULT_THEME_ID);
    }

    const img = new Image();
    img.src = WALLPAPER_SRC;
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {}
      markReady();
    };
    img.onerror = markReady;
    if (img.complete) {
      markReady();
    }
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#231B22" />
</svelte:head>

<div class="app-shell">
  <div class="app-background" class:is-ready={backgroundReady} aria-hidden="true"></div>

  {#if showThemePicker}
    <section class="theme-picker" aria-label="Theme picker">
      <div class="theme-picker__shell">
        <p class="theme-picker__kicker">Theme Archive</p>
        <h2>Pick Your Aura</h2>
        <p class="theme-picker__copy">先选一种今天网站的气色，整站背景、阴影和发光会一起切换。</p>
        <div class="theme-picker__grid">
          {#each themeCatalog as theme}
            <button
              type="button"
              class="theme-card"
              data-theme-id={theme.id}
              style={`--a:${theme.primary};--b:${theme.secondary};`}
              onclick={() => chooseTheme(theme.id)}
            >
              <span class="theme-card__pair">{theme.pair}</span>
              <strong>{theme.displayName}</strong>
              <small>{theme.mood}</small>
            </button>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  {#if isLoading && !showThemePicker}
    <div class="preloader-overlay" aria-live="polite">
      <div class="preloader-center">
        <p class="preloader-kicker">opening sequence</p>
        <div class="digit-display">96<span class="unit">%</span></div>
        <p class="preloader-note">liquid veil lifting</p>
      </div>
    </div>
  {/if}

  <div class="main-content-assembly" class:opacity-0={isLoading || showThemePicker}>
    <PageTransition routeKey={page.url.pathname} {prefersReducedMotion}>
      <div class="shell-slot">
        {@render children?.()}
      </div>
    </PageTransition>
  </div>
</div>

<style>
  .app-shell {
    min-height: 100vh;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at 14% 8%, rgba(var(--glow-primary-rgb), 0.14), transparent 26%),
      radial-gradient(circle at 86% 14%, rgba(var(--glow-secondary-rgb), 0.16), transparent 28%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 14%);
  }

  .app-background {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .app-background::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/IMG_1695.webp');
    background-repeat: no-repeat;
    background-position: center -24px;
    background-size: cover;
    opacity: 0;
    transition: opacity 280ms ease-out;
  }

  .app-background.is-ready::before {
    opacity: 1;
  }

  .theme-picker {
    position: fixed;
    inset: 0;
    z-index: 6000;
    display: grid;
    place-items: center;
    padding: 1.5rem;
  }

  .theme-picker__shell {
    width: min(56rem, 100%);
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(8, 15, 26, 0.76);
    padding: 1.75rem;
    backdrop-filter: blur(18px);
  }

  .theme-picker__kicker,
  .preloader-kicker {
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    opacity: 0.58;
  }

  .theme-picker__grid {
    margin-top: 1.25rem;
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }

  .theme-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.5rem;
    background: linear-gradient(160deg, color-mix(in srgb, var(--a) 34%, rgba(255,255,255,0.06)), color-mix(in srgb, var(--b) 26%, rgba(8,15,26,0.8)));
    color: white;
    text-align: left;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .preloader-overlay {
    position: fixed;
    inset: 0;
    z-index: 5000;
    display: grid;
    place-items: center;
    background: rgba(8, 15, 26, 0.7);
    backdrop-filter: blur(14px);
  }

  .digit-display {
    font-size: clamp(3rem, 8vw, 5rem);
    font-weight: 900;
  }

  .unit {
    font-size: 0.35em;
  }

  .main-content-assembly {
    position: relative;
    z-index: 2;
    min-height: 100vh;
    transition: opacity 0.45s ease-out;
  }

  .shell-slot {
    min-height: 100vh;
    position: relative;
    z-index: 2;
  }

  .opacity-0 {
    opacity: 0;
  }
</style>
