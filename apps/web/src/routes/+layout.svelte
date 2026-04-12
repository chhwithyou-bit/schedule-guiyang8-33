<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import ShellChrome from '$lib/ui/ShellChrome.svelte';
  import Header from '$lib/components/layout/Header.svelte';
  import LiquidBar from '$lib/components/layout/LiquidBar.svelte';
  import { readStoredCommunitySession } from '$lib/api/communityAuth';

  let { children } = $props<{ children?: import('svelte').Snippet }>();

  let isAuthenticated = $state(false);
  let isAdmin = $state(false);

  const isRootRoute = $derived(page.url.pathname === '/');

  onMount(() => {
    const session = readStoredCommunitySession();
    isAuthenticated = Boolean(session);
    isAdmin = session?.role === 'admin' || session?.role === 'owner';
  });
</script>

<ShellChrome>
  {#if isRootRoute}
    <a href="#main-content" class="skip-link">跳到主要内容</a>
    <Header {isAuthenticated} {isAdmin} />
    <LiquidBar class="liquid-bar-dock" {isAuthenticated} {isAdmin} />

    <main id="main-content" tabindex="-1" class="view-wrapper">
      {@render children?.()}
    </main>
  {:else}
    {@render children?.()}
  {/if}
</ShellChrome>

<style>
  .skip-link {
    position: fixed;
    left: 1rem;
    top: 1rem;
    z-index: 7000;
    border-radius: 999px;
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
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

  .view-wrapper {
    width: min(80rem, calc(100% - 3rem));
    margin: 0 auto;
    padding: 10rem 0 6rem;
    position: relative;
    z-index: 2;
  }

  :global(.route-shell) {
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(8, 15, 26, 0.42);
    padding: 2rem;
    backdrop-filter: blur(16px);
  }

  :global(.route-kicker) {
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  :global(.route-shell h1) {
    margin-top: 0.75rem;
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  :global(.route-shell p:last-child) {
    margin-top: 0.9rem;
    max-width: 42rem;
    line-height: 1.7;
    opacity: 0.82;
  }

  @media (max-width: 768px) {
    .view-wrapper {
      width: min(100% - 2rem, 80rem);
      padding-top: 9rem;
      padding-bottom: 5rem;
    }
  }
</style>
