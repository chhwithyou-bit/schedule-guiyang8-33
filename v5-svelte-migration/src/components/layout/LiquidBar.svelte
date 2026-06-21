<script lang="ts">
  import { onMount } from 'svelte';
  import { currentView, isAdmin, isAuthenticated, selectedProfile, user, unreadNotificationsCount, type CurrentView } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';
  import { navigateToCommunitySection, navigateToView } from '../../lib/appRouter';
  import { communityFetch } from '../../lib/communityApi';

  let className = '';
  export { className as class };

  let isExpanded = false;
  let shellRef: HTMLDivElement | null = null;
  let unreadRefreshInterval: ReturnType<typeof setInterval> | null = null;

  $: views = [
    { id: 'community', label: '社区' },
    ...($isAdmin ? [{ id: 'admin', label: '管理' }] : [])
  ] as Array<{ id: CurrentView; label: string }>;

  $: currentViewLabel = views.find((view) => view.id === $currentView)?.label || '菜单';

  async function fetchUnreadCount() {
    if (!$isAuthenticated) {
      unreadNotificationsCount.set(0);
      return;
    }
    try {
      const res = await communityFetch('/api/community/notifications/unread_count');
      const data = await res.json();
      if (data.ok) {
        unreadNotificationsCount.set(data.count);
      }
    } catch (e) {
      // Ignore
    }
  }

  $: if ($isAuthenticated) {
    fetchUnreadCount();
  }

  function closeBar() {
    isExpanded = false;
  }

  function handleNav(id: CurrentView) {
    navigateToView(id);
    closeBar();
  }

  function openComposer() {
    openModal($isAuthenticated ? 'comm-post' : 'auth');
    closeBar();
  }

  function openNotifications() {
    setCommunityConsoleState({ tab: 'notifications', returnFocusSelector: '[data-liquid-target="notifications"]' });
    openModal('console');
    closeBar();
  }

  function openFavorites() {
    navigateToCommunitySection('favorites');
    closeBar();
  }

  function openDrive() {
    setCommunityConsoleState({ tab: 'drive', returnFocusSelector: '[data-liquid-target="drive"]' });
    openModal('console');
    closeBar();
  }

  onMount(() => {
    fetchUnreadCount();
    unreadRefreshInterval = setInterval(fetchUnreadCount, 10000);
    const handlePointerDown = (event: PointerEvent) => {
      if (!isExpanded || !shellRef) return;
      if (!shellRef.contains(event.target as Node)) closeBar();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBar();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      if (unreadRefreshInterval) clearInterval(unreadRefreshInterval);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  });
</script>

<nav id="liquidBar" data-motion-role="liquid-nav" class="liquid-anchor {className}" aria-label="快速导航">
  <div bind:this={shellRef} class="liquid-shell {isExpanded ? 'is-expanded' : ''}">
    <button
      type="button"
      class="liquid-trigger relative"
      on:click={() => (isExpanded = !isExpanded)}
      aria-expanded={isExpanded}
      aria-controls="liquid-bar-panel"
      aria-haspopup="dialog"
    >
      {#if $unreadNotificationsCount > 0}
        <span class="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 shadow-sm animate-pulse"></span>
      {/if}
	      <span class="slash" aria-hidden="true">/</span>
	      <span class="trigger-copy">
	        <small>Quick</small>
	        <strong>{currentViewLabel}</strong>
	      </span>
    </button>

    {#if isExpanded}
      <div id="liquid-bar-panel" class="liquid-panel" role="dialog" aria-label="快速导航菜单">
        <div class="panel-head">
          <div>
	            <p class="ui-kicker">Navigate</p>
	            <p class="panel-title">少量入口，保持手边可达。</p>
          </div>
	          <button type="button" class="mini-btn" on:click={closeBar}>收起</button>
        </div>

        <div class="nav-grid">
          {#each views as view}
            <button type="button" class="liquid-nav-btn {$currentView === view.id ? 'is-active' : ''}" on:click={() => handleNav(view.id)}>
              {view.label}
            </button>
          {/each}
        </div>

        <div class="action-stack">
          <button type="button" class="liquid-compose-btn" on:click={openComposer}>
            <span>{$isAuthenticated ? '发一条' : '登录后发帖'}</span><span aria-hidden="true">/</span>
          </button>
          <button type="button" data-liquid-target="notifications" class="liquid-console-btn flex items-center justify-between" on:click={openNotifications}>
            <span>提醒</span>
            {#if $unreadNotificationsCount > 0}
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{$unreadNotificationsCount > 99 ? '99+' : $unreadNotificationsCount}</span>
            {/if}
          </button>
          <button type="button" data-liquid-target="favorites" class="liquid-console-btn" on:click={openFavorites}>收藏</button>
          {#if $isAuthenticated}
            <button type="button" class="liquid-console-btn" on:click={() => { selectedProfile.set($user); closeBar(); }}>个人主页</button>
            <button type="button" data-liquid-target="drive" class="liquid-console-btn" on:click={openDrive}>广场</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</nav>

<style>
  .liquid-anchor {
    position: fixed;
    bottom: max(env(safe-area-inset-bottom, 0px), 1rem);
    left: max(env(safe-area-inset-left, 0px), 1rem);
    z-index: 5100;
    pointer-events: none;
  }

  .liquid-shell {
    position: relative;
    pointer-events: auto;
  }

	  .liquid-trigger,
	  .liquid-panel,
  .liquid-nav-btn,
  .liquid-console-btn,
  .liquid-compose-btn,
  .mini-btn {
	    border: 1px solid var(--hairline-strong);
	    background: rgba(250, 249, 245, 0.92);
	    box-shadow: 0 18px 44px rgba(var(--shadow-rgb), 0.08);
	    backdrop-filter: blur(12px);
	  }

  .liquid-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.72rem;
    min-width: 4.75rem;
	    min-height: 4.25rem;
	    border-radius: 12px;
	    padding: 0.78rem 0.92rem;
    font-family: var(--sans);
    transition: transform 180ms ease, border-color 180ms ease;
  }

  .liquid-trigger:hover {
    transform: translateY(-1px);
    border-color: var(--ink);
  }

  .slash {
	    color: var(--clay);
	    font-size: 1.6rem;
	    line-height: 1;
	  }

  .trigger-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.05;
  }

  .trigger-copy small {
    color: var(--ink-soft);
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .trigger-copy strong {
    font-size: 0.95rem;
    font-weight: 600;
  }

  .liquid-panel {
    position: absolute;
    bottom: calc(100% + 0.8rem);
	    left: 0;
    width: min(20rem, calc(100vw - 2rem));
	    border-radius: 12px;
	    padding: 1rem;
    animation: panel-in 220ms var(--motion-ease-apple) both;
  }

  .panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-title {
    margin-top: 0.25rem;
	    color: var(--ink-soft);
	    font-size: 0.92rem;
	  }

  .mini-btn,
  .liquid-nav-btn,
  .liquid-console-btn,
  .liquid-compose-btn {
	    border-radius: 8px;
    font-family: var(--sans);
    font-size: 0.88rem;
    font-weight: 500;
    transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, color 180ms ease;
  }

  .mini-btn {
    padding: 0.5rem 0.72rem;
  }

  .nav-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .liquid-nav-btn,
  .liquid-console-btn,
  .liquid-compose-btn {
    min-height: 42px;
    padding: 0.75rem 0.85rem;
    text-align: left;
  }

	  .liquid-nav-btn.is-active,
	  .liquid-compose-btn {
	    border-color: var(--clay);
	    background: var(--clay);
	    color: var(--paper);
  }

  .liquid-compose-btn {
    display: flex;
    justify-content: space-between;
  }

  .action-stack {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.75rem;
  }

  .liquid-nav-btn:hover,
  .liquid-console-btn:hover,
  .liquid-compose-btn:hover,
  .mini-btn:hover {
    transform: translateY(-1px);
    border-color: var(--ink);
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 640px) {
    .trigger-copy {
      display: none;
    }

	    .liquid-trigger {
	      min-width: 3.75rem;
	      min-height: 3.75rem;
	      justify-content: center;
	    }
  }
</style>
