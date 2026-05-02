<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTheme, themeCatalog } from '../../stores/theme';
  import { currentView, isAdmin, isAuthenticated, type CurrentView } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';
  import { navigateToCommunitySection, navigateToView } from '../../lib/appRouter';

  let className = '';
  export { className as class };

  let isExpanded = false;
  let shellRef: HTMLDivElement | null = null;

  const viewCopy: Record<string, { eyebrow: string; detail: string; short: string; capsule: string }> = {
    community: {
      eyebrow: '8community',
      detail: '社区现在专注动态、发现和通知。',
      short: '看近况',
      capsule: '社区中枢'
    },
    profile: {
      eyebrow: 'personal room',
      detail: '个人页只负责资料、主题和自己的内容。',
      short: '看自己',
      capsule: '个人主场'
    },
    admin: {
      eyebrow: 'control room',
      detail: '后台管理专注审核、公告和媒体运维。',
      short: '管后台',
      capsule: '治理中心'
    }
  };

  $: views = [
    { id: 'community', label: '社区' },
    { id: 'profile', label: '个人' },
    ...($isAdmin ? [{ id: 'admin', label: '管理' }] : [])
  ] as Array<{ id: CurrentView; label: string }>;

  $: currentViewLabel = views.find((view) => view.id === $currentView)?.label || '菜单';
  $: currentViewMood = viewCopy[$currentView] || viewCopy.community;

  const themes = themeCatalog.map((theme) => ({
    id: theme.id,
    colorA: theme.primary,
    colorB: theme.secondary,
    colorBg: theme.bg,
    label: theme.liquidLabel
  }));

  function toggleExpanded() {
    isExpanded = !isExpanded;
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

  function openProfile() {
    navigateToView('profile');
    closeBar();
  }

  function openNotifications() {
    setCommunityConsoleState({ tab: 'notifications', returnFocusSelector: '[data-liquid-target="notifications"]' });
    navigateToCommunitySection('notifications');
    closeBar();
  }

  function openFavorites() {
    navigateToCommunitySection('favorites');
    closeBar();
  }

  function requestTheme(id: string, event: MouseEvent) {
    window.dispatchEvent(
      new CustomEvent('request-theme-switch', {
        detail: { id, x: event.clientX, y: event.clientY }
      })
    );
  }

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isExpanded || !shellRef) return;
      if (!shellRef.contains(event.target as Node)) {
        closeBar();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBar();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  });
</script>

<nav id="liquidBar" data-motion-role="liquid-nav" class="liquid-anchor fixed z-[5100] select-none {className}" aria-label="快速导航">
  <div bind:this={shellRef} class="liquid-shell {isExpanded ? 'is-expanded' : ''}">
    <button
      type="button"
      class="liquid-trigger"
      on:click={toggleExpanded}
      aria-expanded={isExpanded}
      aria-controls="liquid-bar-panel"
      aria-haspopup="dialog"
    >
      <span class="liquid-trigger-emblem" aria-hidden="true">
        <span class="liquid-emblem-bars">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </span>

      <span class="liquid-trigger-copy">
        <span class="liquid-trigger-kicker">{currentViewMood.eyebrow}</span>
        <strong>{currentViewLabel}</strong>
        <small>{currentViewMood.capsule}</small>
      </span>

      <span class="liquid-trigger-arrow {isExpanded ? 'is-open' : ''}" aria-hidden="true">⌄</span>
    </button>

    {#if isExpanded}
      <div id="liquid-bar-panel" class="liquid-panel" role="dialog" aria-modal="true" aria-label="液态导航菜单">
        <div class="liquid-panel-head">
          <div>
            <p class="liquid-panel-kicker">{currentViewMood.eyebrow}</p>
            <p class="liquid-panel-title">{currentViewMood.detail}</p>
          </div>
          <button type="button" class="liquid-close" on:click={closeBar}>收起</button>
        </div>

        <section class="liquid-section">
          <div class="liquid-section-head">
            <p class="liquid-section-kicker">Quick jump</p>
            <span>主入口</span>
          </div>

          <div class="liquid-nav-grid">
            {#each views as view}
              <button
                type="button"
                class="liquid-nav-btn {$currentView === view.id ? 'is-active' : ''}"
                on:click={() => handleNav(view.id)}
              >
                <span class="liquid-nav-label">{view.label}</span>
                <span class="liquid-nav-hint">{viewCopy[view.id]?.short || '进入'}</span>
              </button>
            {/each}
          </div>
        </section>

        <section class="liquid-section">
          <div class="liquid-section-head">
            <p class="liquid-section-kicker">Utility actions</p>
            <span>快捷处理</span>
          </div>

          <div class="liquid-action-stack">
            <button type="button" class="liquid-console-btn is-primary" on:click={openProfile}>
              <span class="liquid-action-copy">
                <strong>个人页面</strong>
                <small>资料、签名和自己的帖子都收在一起。</small>
              </span>
              <span class="liquid-action-glyph" aria-hidden="true">•</span>
            </button>

            <button type="button" data-liquid-target="notifications" class="liquid-console-btn" on:click={openNotifications}>
              <span class="liquid-action-copy">
                <strong>互动通知</strong>
                <small>最新提醒和互动反馈集中查看。</small>
              </span>
              <span class="liquid-action-glyph" aria-hidden="true">!</span>
            </button>

            <button type="button" data-liquid-target="favorites" class="liquid-console-btn" on:click={openFavorites}>
              <span class="liquid-action-copy">
                <strong>收藏夹</strong>
                <small>点过星星的帖子会留在这里。</small>
              </span>
              <span class="liquid-action-glyph" aria-hidden="true">★</span>
            </button>

            {#if $currentView === 'community'}
              <button type="button" class="liquid-compose-btn" on:click={openComposer}>
                <span class="liquid-action-copy">
                  <strong>+ 发一条</strong>
                  <small>{$isAuthenticated ? '把刚发生的事直接丢到广场。' : '先登录，再把近况发出去。'}</small>
                </span>
                <span class="liquid-action-glyph" aria-hidden="true">+</span>
              </button>
            {/if}
          </div>
        </section>

        <section class="liquid-theme-row">
          <p>切一个气氛</p>

          <div class="liquid-theme-dots">
            {#each themes as theme}
              <button
                type="button"
                class="theme-dot {$activeTheme === theme.id ? 'is-active' : ''}"
                style="--theme-color-a: {theme.colorA}; --theme-color-b: {theme.colorB}; --theme-color-bg: {theme.colorBg};"
                aria-label={`切换到 ${theme.label}`}
                on:click={(event) => requestTheme(theme.id, event)}
              >
                <span class="theme-dot-core"></span>
              </button>
            {/each}
          </div>
        </section>
      </div>
    {/if}
  </div>
</nav>

<style>
  .liquid-anchor {
    top: auto;
    right: auto;
    bottom: max(env(safe-area-inset-bottom, 0px), 1rem);
    left: max(env(safe-area-inset-left, 0px), 1rem);
    width: auto;
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
  .liquid-close,
  .theme-dot {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05) 42%, rgba(255, 255, 255, 0.09)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.74), rgba(var(--color-bg-rgb), 0.64));
    backdrop-filter: blur(20px) saturate(1.08);
    box-shadow:
      0 18px 42px rgba(var(--shadow-rgb), 0.18),
      0 6px 16px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    transition:
      transform var(--motion-duration-medium) var(--motion-ease-apple),
      border-color var(--motion-duration-fast) var(--motion-ease-apple),
      box-shadow var(--motion-duration-medium) var(--motion-ease-apple),
      background var(--motion-duration-medium) var(--motion-ease-apple),
      opacity var(--motion-duration-fast) var(--motion-ease-standard);
    will-change: transform, box-shadow;
  }

  .liquid-trigger {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 4.75rem;
    min-height: 4.75rem;
    justify-content: center;
    border-radius: 1.75rem;
    padding: 0.65rem;
    text-align: left;
  }

  .liquid-trigger-emblem {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.24), rgba(var(--glow-secondary-rgb), 0.14));
  }

  .liquid-emblem-bars {
    display: inline-flex;
    gap: 0.22rem;
  }

  .liquid-emblem-bars span {
    width: 0.18rem;
    border-radius: 999px;
    background: var(--color-text);
  }

  .liquid-emblem-bars span:nth-child(1) { height: 0.95rem; }
  .liquid-emblem-bars span:nth-child(2) { height: 1.25rem; }
  .liquid-emblem-bars span:nth-child(3) { height: 0.75rem; }

  .liquid-trigger-copy {
    display: none;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 0.12rem;
  }

  .liquid-trigger-kicker,
  .liquid-panel-kicker,
  .liquid-section-kicker {
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.42;
  }

  .liquid-trigger-copy strong {
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: -0.02em;
  }

  .liquid-trigger-copy small {
    font-size: 0.72rem;
    opacity: 0.64;
  }

  .liquid-trigger-arrow {
    display: none;
    font-size: 1.2rem;
    transition: transform var(--motion-duration-fast) var(--motion-ease-apple);
  }

  .liquid-trigger-arrow.is-open {
    transform: rotate(180deg);
  }

  .liquid-panel {
    position: absolute;
    bottom: calc(100% + 0.8rem);
    left: 0;
    margin-top: 0;
    width: min(20rem, calc(100vw - 2rem));
    max-height: min(44rem, calc(100svh - 8rem));
    overflow-y: auto;
    border-radius: 2rem;
    padding: 1.1rem;
    transform-origin: bottom left;
    animation: liquid-panel-enter var(--motion-duration-slow) var(--motion-ease-apple) both;
  }

  .liquid-shell.is-expanded .liquid-trigger {
    border-color: rgba(var(--glow-primary-rgb), 0.2);
    box-shadow:
      0 24px 48px rgba(var(--shadow-rgb), 0.22),
      0 8px 20px rgba(var(--shadow-rgb), 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .liquid-panel-head,
  .liquid-section-head,
  .liquid-theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .liquid-panel-title {
    margin-top: 0.3rem;
    max-width: 18rem;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.6;
    opacity: 0.72;
  }

  .liquid-close {
    border-radius: 999px;
    padding: 0.55rem 0.85rem;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .liquid-section {
    margin-top: 1rem;
  }

  .liquid-nav-grid,
  .liquid-action-stack {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.8rem;
  }

  .liquid-nav-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .liquid-nav-btn,
  .liquid-console-btn,
  .liquid-compose-btn {
    border-radius: 1.4rem;
    padding: 1rem;
    text-align: left;
  }

  .liquid-nav-btn.is-active {
    border-color: rgba(var(--glow-primary-rgb), 0.22);
    background:
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.18), rgba(var(--glow-secondary-rgb), 0.09)),
      rgba(var(--color-bg-rgb), 0.16);
  }

  .liquid-nav-label,
  .liquid-action-copy strong {
    display: block;
    font-size: 0.95rem;
    font-weight: 900;
    letter-spacing: -0.02em;
  }

  .liquid-nav-hint,
  .liquid-action-copy small {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.76rem;
    line-height: 1.6;
    opacity: 0.66;
  }

  .liquid-console-btn,
  .liquid-compose-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .liquid-console-btn.is-primary,
  .liquid-compose-btn {
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 86%, white 14%), var(--color-primary));
    color: var(--color-button-text);
  }

  .liquid-action-glyph {
    font-size: 1.2rem;
    font-weight: 900;
  }

  .liquid-theme-row {
    margin-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 1rem;
  }

  .liquid-theme-row p {
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.48;
  }

  .liquid-theme-dots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .theme-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 999px;
    padding: 0;
  }

  .theme-dot-core {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 999px;
    background:
      radial-gradient(circle at 34% 28%, var(--theme-color-a), transparent 48%),
      radial-gradient(circle at 74% 74%, var(--theme-color-b), transparent 52%),
      var(--theme-color-bg);
  }

  .theme-dot.is-active {
    border-color: rgba(var(--glow-primary-rgb), 0.28);
  }

  .liquid-trigger:hover,
  .liquid-nav-btn:hover,
  .liquid-console-btn:hover,
  .liquid-compose-btn:hover,
  .liquid-close:hover,
  .theme-dot:hover {
    transform: var(--motion-lift);
  }

  @keyframes liquid-panel-enter {
    from {
      opacity: 0;
      transform: translate3d(0, 10px, 0) scale(0.986);
      filter: blur(6px);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
      filter: blur(0);
    }
  }

  @media (max-width: 767px) {
    .liquid-anchor {
      right: auto;
      bottom: max(env(safe-area-inset-bottom, 0px), 0.95rem);
      left: max(env(safe-area-inset-left, 0px), 0.85rem);
      width: auto;
    }

    .liquid-trigger {
      width: 4.35rem;
      min-height: 4.35rem;
      justify-content: center;
      border-radius: 1.65rem;
      padding: 0.55rem;
    }

    .liquid-trigger-copy,
    .liquid-trigger-arrow {
      display: none;
    }

    .liquid-panel {
      right: auto;
      left: 0;
      bottom: calc(100% + 0.8rem);
      width: min(21rem, calc(100vw - 1.2rem));
      max-height: min(34rem, calc(100svh - 6rem));
      overflow-y: auto;
      transform-origin: bottom left;
    }

    .liquid-nav-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
