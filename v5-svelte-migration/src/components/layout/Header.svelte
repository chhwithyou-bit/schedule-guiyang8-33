<script lang="ts">
  import { onMount } from 'svelte';

  import { currentView, user, isAuthenticated, isAdmin, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';

  const SHOW_THRESHOLD = 60;
  const HIDE_THRESHOLD = 96;

  let y = 0;
  let lastY = 0;
  let isVisible = true;
  let isScrolled = false;

  function openConsoleView() {
    setCommunityConsoleState({ tab: 'account', conversationId: '' });
    currentView.set('console');
  }

  function openConsoleTab(tab: 'account' | 'chats') {
    setCommunityConsoleState({ tab, conversationId: '' });
    currentView.set('console');
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
    <div class="group cursor-pointer">
      <h1 class="text-2xl font-black tracking-tighter transition-transform group-hover:scale-110">
        8<span class="text-[var(--color-primary)]">社区</span>
      </h1>
    </div>

    <!-- Navigation / Profile -->
    <div class="flex items-center gap-6">
      {#if $isAuthenticated}
        <div class="header-switch-shell hidden items-center gap-2 p-1 md:flex">
          <button
            on:click={openConsoleView}
            class="header-switch {($currentView === 'console') ? 'is-active' : ''}"
          >
            个人
          </button>
          <button
            on:click={() => openConsoleTab('chats')}
            class="header-switch {($currentView === 'console') ? 'is-active-soft' : ''}"
          >
            消息
          </button>
        </div>
        <button 
          on:click={openConsoleView}
          class="header-avatar-shell flex h-10 w-10 items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-105"
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
          on:click={() => openModal('auth')}
          class="px-6 py-2.5 rounded-full bg-[var(--color-primary)] text-white text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
        >
          登录
        </button>
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
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.14), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.08);
    backdrop-filter: blur(16px) saturate(1.08);
    box-shadow: 0 12px 26px rgba(var(--shadow-rgb), 0.08);
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
    border-radius: 999px;
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
    background: var(--color-primary);
    color: var(--color-bg);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
  }

  .header-switch.is-active-soft {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text);
  }

  .header-avatar-shell {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    box-shadow:
      0 10px 22px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(16px);
  }
</style>
