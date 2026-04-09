<script lang="ts">
  import { onMount } from 'svelte';

  import { currentView, user, isAuthenticated, isAdmin } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';

  function goHome() {
    currentView.set('community');
  }

  const SHOW_THRESHOLD = 60;
  const HIDE_THRESHOLD = 96;

  let y = 0;
  let lastY = 0;
  let isVisible = true;
  let isScrolled = false;

  function openConsoleView() {
    setCommunityConsoleState({ tab: 'account', conversationId: '', returnFocusSelector: '[data-console-launch="header-account"]' });
    openModal('community-console');
  }

  function openConsoleTab(tab: 'account' | 'chats') {
    setCommunityConsoleState({ tab, conversationId: '', returnFocusSelector: '[data-console-launch="header-tab"]' });
    openModal('community-console');
  }

  onMount(() => {
    // Auth init
    const saved = localStorage.getItem('commUser');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        user.set(u);
        isAuthenticated.set(true);
        isAdmin.set(u.role === 'admin' || u.role === 'owner');
      } catch (e) {}
    }

    // Basic scroll hide/show logic
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
  class="fixed top-0 left-0 right-0 z-[5000] px-6 md:px-12 py-6 transition-all duration-300
         {isVisible ? 'translate-y-0' : '-translate-y-full'}"
>
  <div class="site-header-shell {isScrolled ? 'is-scrolled' : ''} max-w-7xl mx-auto flex items-center justify-between">
    <!-- Logo -->
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

    <!-- Navigation / Profile -->
    <div class="flex items-center gap-6">
      {#if $isAuthenticated}
        <div class="header-switch-shell hidden items-center gap-2 p-1 md:flex">
          <button
            type="button"
            data-console-launch="header-account"
            on:click={openConsoleView}
            class="header-switch {($currentView === 'console') ? 'is-active' : ''}"
          >
            个人
          </button>
          <button
            type="button"
            data-console-launch="header-tab"
            on:click={() => openConsoleTab('chats')}
            class="header-switch {($currentView === 'console') ? 'is-active-soft' : ''}"
          >
            消息
          </button>
        </div>
        <button
          type="button"
          on:click={openConsoleView}
          class="header-avatar-shell {($currentView === 'console') ? 'is-active' : ''} flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
          aria-label="打开个人面板"
        >
          {#if $user.avatar_url}
            <img src={$user.avatar_url} alt="" class="w-full h-full object-cover" />
          {:else}
            <span class="text-xs font-black text-[var(--color-primary)]">{$user.username.slice(0,1).toUpperCase()}</span>
          {/if}
        </button>
      {:else}
        <button
          on:click={openConsoleView}
          class="hidden header-switch-shell md:inline-flex"
        >
          账号入口
        </button>
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
    transition:
      transform 0.22s ease,
      background 0.22s ease,
      border-color 0.22s ease,
      box-shadow 0.22s ease;
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
