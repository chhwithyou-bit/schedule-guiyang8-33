<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getVisibleNavItems, isPathActive } from '$lib/components/layout/nav';

  export let isAuthenticated = false;
  export let isAdmin = false;

  const SHOW_THRESHOLD = 60;
  const HIDE_THRESHOLD = 96;

  let y = 0;
  let lastY = 0;
  let isVisible = true;
  let isScrolled = false;

  function isActive(href: string) {
    return isPathActive(page.url.pathname, href);
  }

  async function navigate(href: string) {
    await goto(href);
  }

  $: visibleNavItems = getVisibleNavItems(isAdmin);
  $: currentNav = visibleNavItems.find((item) => isActive(item.href)) ?? visibleNavItems[0];

  function handleScroll() {
    if (y <= SHOW_THRESHOLD) {
      isVisible = true;
    } else if (y > lastY && y > HIDE_THRESHOLD) {
      isVisible = false;
    } else if (y < lastY) {
      isVisible = true;
    }

    if (y > HIDE_THRESHOLD) {
      isScrolled = true;
    } else if (y < SHOW_THRESHOLD) {
      isScrolled = false;
    }

    lastY = y;
  }
</script>

<svelte:window bind:scrollY={y} on:scroll={handleScroll} />

<header
  class="fixed top-0 left-0 right-0 z-[5000] px-6 md:px-12 py-6 transition-all duration-300 {isVisible ? 'translate-y-0' : '-translate-y-full'}"
>
  <div class="site-header-shell {isScrolled ? 'is-scrolled' : ''} mx-auto flex max-w-7xl items-center justify-between gap-4">
    <a
      href="/community"
      class="group rounded-full px-2 py-1 text-left transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      aria-label="前往社区首页"
    >
      <span class="text-2xl font-black tracking-tighter transition-transform group-hover:scale-110">
        8<span class="text-[var(--color-primary)]">社区</span>
      </span>
    </a>

    <div class="flex items-center gap-4 md:gap-6">
      <nav aria-label="主导航" class="header-switch-shell hidden items-center gap-2 p-1 md:flex">
        {#each visibleNavItems as item}
          <button
            type="button"
            class="header-switch {isActive(item.href) ? 'is-active' : ''}"
            aria-pressed={isActive(item.href)}
            aria-label={`前往${item.label}`}
            on:click={() => navigate(item.href)}
          >
            {item.shortLabel ?? item.label}
          </button>
        {/each}
      </nav>

      {#if isAuthenticated}
        <a
          href="/console"
          class="header-avatar-shell {isActive('/console') ? 'is-active' : ''} flex h-10 min-w-10 items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          aria-label="前往消息台"
        >
          <span class="text-xs font-black text-[var(--color-primary)]">{currentNav?.label?.slice(0, 1) ?? '我'}</span>
        </a>
      {:else}
        <a
          href="/register"
          class="hidden header-switch-shell px-4 py-2 md:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          注册
        </a>
        <a
          href="/login"
          class="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          登录
        </a>
      {/if}
    </div>
  </div>
</header>

<style>
  .site-header-shell {
    padding: 0.85rem 1rem;
    border-radius: 999px;
    background: transparent;
    transition:
      background 0.25s ease,
      border-color 0.25s ease,
      box-shadow 0.25s ease,
      backdrop-filter 0.25s ease;
  }

  .site-header-shell.is-scrolled {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background:
      linear-gradient(180deg, rgba(var(--color-bg-rgb, 12 18 28), 0.14), rgba(var(--color-bg-rgb, 12 18 28), 0.08)),
      rgba(var(--color-bg-rgb, 12 18 28), 0.08);
    backdrop-filter: blur(16px) saturate(1.08);
    box-shadow: 0 12px 26px rgba(var(--shadow-rgb, 0 0 0), 0.08);
  }

  .header-switch-shell {
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    transition: transform 0.2s ease, background 0.2s ease;
  }

  .header-switch {
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0.6rem 0.9rem;
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    transition:
      transform 0.2s ease,
      background 0.2s ease,
      color 0.2s ease,
      opacity 0.2s ease;
  }

  .header-switch.is-active {
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
  }

  .header-avatar-shell {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    box-shadow:
      0 10px 22px rgba(var(--shadow-rgb, 0 0 0), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(16px);
  }

  .header-avatar-shell.is-active {
    border-color: color-mix(in srgb, var(--color-primary, #f97316) 68%, white 32%);
    box-shadow:
      0 10px 22px rgba(var(--shadow-rgb, 0 0 0), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
</style>
