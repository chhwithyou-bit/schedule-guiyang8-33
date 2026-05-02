<script lang="ts">
  import { onMount } from 'svelte';

  import { currentView, isAdmin, isAuthenticated, user } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import {
    isCommunityAdminRole,
    readStoredCommunitySession,
    refreshStoredCommunitySession
  } from '../../lib/communityApi';
  import { navigateToCommunitySection, navigateToView } from '../../lib/appRouter';

  const SHOW_THRESHOLD = 60;
  const HIDE_THRESHOLD = 96;

  let y = 0;
  let lastY = 0;
  let isVisible = true;
  let isScrolled = false;

  function goHome() {
    navigateToCommunitySection('feed');
  }

  function goProfile() {
    navigateToView('profile');
  }

  function applyCommunitySession(nextUser: ReturnType<typeof readStoredCommunitySession>) {
    user.set(nextUser);
    isAuthenticated.set(Boolean(nextUser));
    isAdmin.set(isCommunityAdminRole(nextUser?.role));
  }

  function clearCommunitySession() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('commUser');
    }
    applyCommunitySession(null);
  }

  onMount(() => {
    try {
      const nextUser = readStoredCommunitySession();
      if (nextUser) {
        applyCommunitySession(nextUser);
        void refreshStoredCommunitySession()
          .then((refreshedUser) => {
            if (refreshedUser) {
              applyCommunitySession(refreshedUser);
              return;
            }

            clearCommunitySession();
          })
          .catch((error) => {
            console.error('Failed to refresh session', error);
          });
      } else if (typeof window !== 'undefined') {
        clearCommunitySession();
      }
    } catch (error) {
      console.error('Failed to restore session', error);
      clearCommunitySession();
    }

    const handleScroll = () => {
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
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<svelte:window bind:scrollY={y} />

<header
  data-motion-role="site-header"
  class="motion-header fixed left-0 right-0 top-0 z-[5000] px-6 py-6 md:px-12
         {isVisible ? 'translate-y-0' : '-translate-y-full'}"
>
  <div class="site-header-shell {isScrolled ? 'is-scrolled' : ''} mx-auto flex max-w-7xl items-center justify-between">
    <button
      type="button"
      on:click={goHome}
      class="group rounded-full px-2 py-1 text-left transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      aria-label="返回 8community 首页"
    >
      <h1 class="text-2xl font-black tracking-tighter transition-transform group-hover:scale-[1.025]">
        8<span class="text-[var(--color-primary)]">community</span>
      </h1>
    </button>

    <div class="flex items-center gap-3 md:gap-4">
      {#if $isAuthenticated}
        <div class="header-switch-shell hidden items-center gap-2 p-1 md:flex">
          <button
            type="button"
            data-header-target="profile"
            on:click={goProfile}
            class="header-switch {$currentView === 'profile' ? 'is-active' : ''}"
          >
            个人
          </button>
          <button
            type="button"
            data-header-target="community"
            on:click={goHome}
            class="header-switch {$currentView === 'community' ? 'is-active-soft' : ''}"
          >
            社区
          </button>
        </div>

        <button
          type="button"
          on:click={goProfile}
          class="header-avatar-shell {$currentView === 'profile' ? 'is-active' : ''} flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
          aria-label="打开个人页面"
        >
          {#if $user?.avatar_url}
            <img src={$user.avatar_url} alt="" class="h-full w-full object-cover" />
          {:else}
            <span class="text-xs font-black text-[var(--color-primary)]">{$user?.username?.slice(0, 1)?.toUpperCase() || 'U'}</span>
          {/if}
        </button>
      {:else}
        <button
          type="button"
          on:click={() => openModal('auth')}
          class="header-login-btn"
        >
          登录
        </button>
      {/if}
    </div>
  </div>
</header>

<style>
  .motion-header {
    transition:
      transform var(--motion-duration-medium) var(--motion-ease-apple),
      opacity var(--motion-duration-medium) var(--motion-ease-apple);
    will-change: transform;
  }

  .motion-header h1 {
    transition: transform var(--motion-duration-medium) var(--motion-ease-apple);
    transform-origin: left center;
  }

  .site-header-shell {
    padding: 0.7rem 0.82rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.14), rgba(var(--color-bg-rgb), 0.08));
    box-shadow:
      0 18px 36px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(18px) saturate(1.1);
    transition:
      background var(--motion-duration-medium) var(--motion-ease-apple),
      border-color var(--motion-duration-medium) var(--motion-ease-apple),
      box-shadow var(--motion-duration-medium) var(--motion-ease-apple),
      backdrop-filter var(--motion-duration-medium) var(--motion-ease-apple),
      transform var(--motion-duration-medium) var(--motion-ease-apple);
    will-change: transform, box-shadow, backdrop-filter;
  }

  .site-header-shell.is-scrolled {
    border-color: rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.2), rgba(var(--color-bg-rgb), 0.1));
    backdrop-filter: blur(22px) saturate(1.12);
    box-shadow:
      0 24px 48px rgba(var(--shadow-rgb), 0.16),
      0 8px 18px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .header-switch-shell,
  .header-avatar-shell,
  .header-login-btn {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)),
      rgba(var(--color-bg-rgb), 0.05);
    box-shadow:
      0 14px 30px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(18px) saturate(1.08);
  }

  .header-switch-shell {
    align-items: center;
    padding: 0.24rem;
    border-radius: 999px;
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .header-switch {
    border-radius: 999px;
    padding: 0.68rem 1rem;
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    transition:
      transform var(--motion-duration-fast) var(--motion-ease-apple),
      background var(--motion-duration-fast) var(--motion-ease-apple),
      color var(--motion-duration-fast) var(--motion-ease-apple),
      opacity var(--motion-duration-fast) var(--motion-ease-apple),
      box-shadow var(--motion-duration-fast) var(--motion-ease-apple);
  }

  .header-switch.is-active {
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.3), transparent 42%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 84%, white 16%), var(--color-primary));
    color: var(--color-button-text);
    box-shadow:
      0 14px 28px rgba(var(--shadow-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
  }

  .header-switch.is-active-soft {
    background: rgba(255, 255, 255, 0.06);
    color: var(--color-text);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .header-avatar-shell {
    position: relative;
    transition:
      transform var(--motion-duration-fast) var(--motion-ease-apple),
      border-color var(--motion-duration-fast) var(--motion-ease-apple),
      background var(--motion-duration-fast) var(--motion-ease-apple),
      box-shadow var(--motion-duration-fast) var(--motion-ease-apple);
  }

  .header-avatar-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.28), transparent 34%);
    opacity: 0.8;
    pointer-events: none;
  }

  .header-avatar-shell.is-active {
    border-color: color-mix(in srgb, var(--color-primary) 56%, white 44%);
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.24), transparent 38%),
      linear-gradient(145deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05)),
      rgba(var(--color-bg-rgb), 0.08);
    box-shadow:
      0 18px 34px rgba(var(--shadow-rgb), 0.18),
      0 0 0 1px rgba(var(--glow-primary-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  .header-login-btn {
    padding: 0.78rem 1.08rem;
    border-radius: 999px;
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-button-text);
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 86%, white 14%), var(--color-primary));
    transition:
      transform var(--motion-duration-fast) var(--motion-ease-apple),
      box-shadow var(--motion-duration-fast) var(--motion-ease-apple),
      filter var(--motion-duration-fast) var(--motion-ease-apple);
    box-shadow:
      0 16px 30px rgba(var(--shadow-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
  }

  .header-switch-shell:hover,
  .header-avatar-shell:hover,
  .header-login-btn:hover {
    transform: var(--motion-lift);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .header-switch-shell:hover,
  .header-avatar-shell:hover {
    box-shadow:
      0 18px 34px rgba(var(--shadow-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .header-login-btn:hover {
    box-shadow:
      0 20px 36px rgba(var(--shadow-rgb), 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.26);
  }

  .header-switch:focus-visible,
  .header-avatar-shell:focus-visible,
  .header-login-btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 3px;
  }
</style>
