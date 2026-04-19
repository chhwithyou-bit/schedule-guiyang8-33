<script lang="ts">
  import { onMount } from 'svelte';

  import { currentView, isAdmin, isAuthenticated, user } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';
  import { setCommunityViewState } from '../../stores/communityViewState';
  import { readStoredCommunitySession } from '../../lib/communityApi';

  const SHOW_THRESHOLD = 60;
  const HIDE_THRESHOLD = 96;

  let y = 0;
  let lastY = 0;
  let isVisible = true;
  let isScrolled = false;

  function goHome() {
    setCommunityViewState({ section: 'feed', messageTab: 'chats' });
    currentView.set('community');
  }

  function goProfile() {
    currentView.set('profile');
  }

  function goMessages() {
    setCommunityConsoleState({ tab: 'chats', conversationId: '', returnFocusSelector: '[data-header-target="messages"]' });
    setCommunityViewState({ section: 'messages', messageTab: 'chats' });
    currentView.set('community');
  }

  onMount(() => {
    try {
      const nextUser = readStoredCommunitySession();
      if (nextUser) {
        user.set(nextUser);
        isAuthenticated.set(true);
        isAdmin.set(nextUser.role === 'admin' || nextUser.role === 'owner');
      } else if (typeof window !== 'undefined') {
        localStorage.removeItem('commUser');
        user.set(null);
        isAuthenticated.set(false);
        isAdmin.set(false);
      }
    } catch (error) {
      console.error('Failed to restore session', error);
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
  class="fixed left-0 right-0 top-0 z-[5000] px-6 py-6 transition-all duration-300 md:px-12
         {isVisible ? 'translate-y-0' : '-translate-y-full'}"
>
  <div class="site-header-shell {isScrolled ? 'is-scrolled' : ''} mx-auto flex max-w-7xl items-center justify-between">
    <button
      type="button"
      on:click={goHome}
      class="group rounded-full px-2 py-1 text-left transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      aria-label="返回社区首页"
    >
      <h1 class="text-2xl font-black tracking-tighter transition-transform group-hover:scale-110">
        8<span class="text-[var(--color-primary)]">社区</span>
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
            data-header-target="messages"
            on:click={goMessages}
            class="header-switch {$currentView === 'community' ? 'is-active-soft' : ''}"
          >
            消息
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
  .site-header-shell {
    padding: 0.7rem 0.82rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.2), rgba(var(--color-bg-rgb), 0.12));
    box-shadow:
      0 18px 36px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(18px) saturate(1.1);
    transition:
      background 0.25s ease,
      border-color 0.25s ease,
      box-shadow 0.25s ease,
      backdrop-filter 0.25s ease,
      transform 0.25s ease;
  }

  .site-header-shell.is-scrolled {
    border-color: rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.28), rgba(var(--color-bg-rgb), 0.16));
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
      rgba(var(--color-bg-rgb), 0.08);
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
      transform 0.22s ease,
      background 0.22s ease,
      color 0.22s ease,
      opacity 0.22s ease,
      box-shadow 0.22s ease;
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
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .header-avatar-shell {
    position: relative;
    transition:
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.22s ease,
      background 0.22s ease,
      box-shadow 0.22s ease;
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
      rgba(var(--color-bg-rgb), 0.12);
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
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.22s ease,
      filter 0.22s ease;
    box-shadow:
      0 16px 30px rgba(var(--shadow-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
  }

  .header-switch-shell:hover,
  .header-avatar-shell:hover,
  .header-login-btn:hover {
    transform: translateY(-1px);
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
