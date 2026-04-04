<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { onMount } from 'svelte';

  import { currentView, isAdmin, isAuthenticated } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { activeTheme, themeCatalog } from '../../stores/theme';

  let className = '';
  export { className as class };

  let isExpanded = false;
  let suppressNextTriggerClick = false;
  let dockRef: HTMLElement;

  const viewCopy: Record<string, { eyebrow: string; detail: string; short: string }> = {
    community: {
      eyebrow: '8community',
      detail: '广场、聊天、群组和控制台都收在这一角。',
      short: '看近况'
    },
    schedule: {
      eyebrow: 'today flow',
      detail: '今天的课表、提醒和安排，一抬手就能切过去。',
      short: '看安排'
    },
    xiangqi: {
      eyebrow: 'slow game',
      detail: '想换口气的时候，直接开一盘象棋。',
      short: '开一局'
    },
    nodes: {
      eyebrow: 'find people',
      detail: '找人、找群、扩连接，从这里进去更顺手。',
      short: '去发现'
    },
    admin: {
      eyebrow: 'control room',
      detail: '管理入口、巡检开关和后台状态都放在这里。',
      short: '巡一下'
    }
  };

  $: views = [
    { id: 'community', label: '社区' },
    { id: 'schedule', label: '课表' },
    { id: 'xiangqi', label: '象棋' },
    { id: 'nodes', label: '节点' },
    ...($isAdmin ? [{ id: 'admin', label: '管理' }] : [])
  ];

  $: currentViewLabel = views.find((view) => view.id === $currentView)?.label || '菜单';
  $: currentViewMood = viewCopy[$currentView] || viewCopy.community;

  const themes = themeCatalog.map((theme) => ({
    id: theme.id,
    colorA: theme.primary,
    colorB: theme.secondary,
    label: theme.liquidLabel
  }));

  function toggleLiquidBar(nextState?: boolean) {
    isExpanded = typeof nextState === 'boolean' ? nextState : !isExpanded;
  }

  function handleTriggerClick() {
    if (suppressNextTriggerClick) {
      suppressNextTriggerClick = false;
      return;
    }

    toggleLiquidBar();
  }

  function handleTriggerTouchStart(event: TouchEvent) {
    event.preventDefault();
    suppressNextTriggerClick = true;
  }

  function handleTriggerTouchEnd(event: TouchEvent) {
    event.preventDefault();
    toggleLiquidBar();
  }

  function closeLiquidBar() {
    isExpanded = false;
  }

  function handleNav(id: string) {
    currentView.set(id);
    closeLiquidBar();
  }

  function requestTheme(id: string, e: MouseEvent) {
    window.dispatchEvent(
      new CustomEvent('request-theme-switch', {
        detail: { id, x: e.clientX, y: e.clientY }
      })
    );
  }

  function openConsole() {
    closeLiquidBar();
    openModal('community-console');
  }

  function openComposer() {
    closeLiquidBar();
    openModal($isAuthenticated ? 'comm-post' : 'auth');
  }

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isExpanded || !dockRef) return;

      if (!dockRef.contains(event.target as Node)) {
        closeLiquidBar();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLiquidBar();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<nav
  bind:this={dockRef}
  id="liquidBar"
  class="liquid-anchor fixed z-[5100] select-none {className}"
  aria-label="快速导航"
>
  {#if isExpanded}
    <button
      type="button"
      class="liquid-backdrop pointer-events-auto"
      on:click={closeLiquidBar}
      transition:fade={{ duration: 220 }}
      aria-label="导航背景"
    ></button>
  {/if}

  <div class="liquid-shell pointer-events-auto {isExpanded ? 'is-expanded' : 'is-collapsed'}">
    <div class="liquid-core">
      <button
        type="button"
        class="liquid-trigger"
        on:click={handleTriggerClick}
        on:touchstart={handleTriggerTouchStart}
        on:touchend={handleTriggerTouchEnd}
        aria-expanded={isExpanded}
        aria-controls="liquid-bar-panel"
      >
        <span class="liquid-trigger-emblem" aria-hidden="true">
          <span class="emblem-ring"></span>
          <span class="emblem-ring emblem-ring-delay"></span>
          <span class="emblem-bars">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </span>

        <span class="liquid-trigger-copy">
          <span class="liquid-trigger-kicker">{currentViewMood.eyebrow}</span>
          <strong>{currentViewLabel}</strong>
        </span>

        <span class="liquid-trigger-arrow {isExpanded ? 'is-open' : ''}" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 10l5 5 5-5"></path>
          </svg>
        </span>
      </button>

      {#if isExpanded}
        <div
          id="liquid-bar-panel"
          class="liquid-panel"
          transition:scale|local={{ duration: 320, start: 0.9, opacity: 0.18 }}
        >
          <div class="liquid-panel-head">
            <div>
              <p class="liquid-panel-kicker">{currentViewMood.eyebrow}</p>
              <p class="liquid-panel-title">{currentViewMood.detail}</p>
            </div>

            <button type="button" class="liquid-close" on:click={closeLiquidBar}>
              收起
            </button>
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

          <div class="liquid-action-stack">
            <button type="button" class="liquid-console-btn" on:click={openConsole}>
              <span class="liquid-action-copy">
                <strong>{$currentView === 'community' ? '打开控制台' : '打开个人面板'}</strong>
                <small>
                  {$currentView === 'community'
                    ? '聊天、群组、网盘和提醒都在这里。'
                    : '资料、消息和常用入口统一放在这里。'}
                </small>
              </span>
              <span class="liquid-action-glyph" aria-hidden="true">↗</span>
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

          <div class="liquid-theme-row">
            <p>切一下气氛</p>

            <div class="liquid-theme-dots">
              {#each themes as t}
                <button
                  type="button"
                  class="theme-dot {$activeTheme === t.id ? 'is-active' : ''}"
                  style="--theme-color-a: {t.colorA}; --theme-color-b: {t.colorB};"
                  aria-label="切换到 {t.label}"
                  on:click={(e) => requestTheme(t.id, e)}
                >
                  <span class="theme-dot-core"></span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>
  .liquid-anchor {
    top: env(safe-area-inset-top, 0px);
    left: env(safe-area-inset-left, 0px);
    width: min(22rem, calc(100vw - env(safe-area-inset-left, 0px)));
  }

  @media (min-width: 768px) {
    .liquid-anchor {
      top: env(safe-area-inset-top, 0px);
      left: env(safe-area-inset-left, 0px);
      width: min(22rem, calc(100vw - env(safe-area-inset-left, 0px)));
    }
  }

  .liquid-backdrop {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(circle at 10rem 7rem, rgba(var(--glow-primary-rgb), 0.16), rgba(255, 255, 255, 0.02) 18%, transparent 36%),
      linear-gradient(180deg, rgba(var(--shadow-rgb), 0.2), rgba(var(--shadow-rgb), 0.46));
    backdrop-filter: blur(2px);
  }

  .liquid-shell {
    position: relative;
    z-index: 1;
    transform-origin: top left;
    transition:
      width 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      filter 0.42s ease;
  }

  .liquid-shell.is-collapsed {
    width: min(12.75rem, calc(100vw - 2rem));
  }

  .liquid-shell.is-expanded {
    width: min(22rem, calc(100vw - 1.5rem));
    filter: saturate(1.05);
  }

  .liquid-core {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 42%),
      linear-gradient(160deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04) 45%, rgba(255, 255, 255, 0.12));
    backdrop-filter: blur(24px) saturate(1.3);
    box-shadow:
      0 22px 54px rgba(var(--shadow-rgb), 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transition:
      border-radius 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      background 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .liquid-shell.is-collapsed .liquid-core {
    border-radius: 999px;
  }

  .liquid-shell.is-expanded .liquid-core {
    border-radius: 2rem;
    box-shadow:
      0 32px 84px rgba(var(--shadow-rgb), 0.4),
      0 12px 30px rgba(var(--shadow-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.34);
  }

  .liquid-core::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    background:
      linear-gradient(125deg, rgba(255, 255, 255, 0.22), transparent 32%),
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.14), transparent 36%);
    opacity: 0.86;
    pointer-events: none;
  }

  .liquid-trigger {
    position: relative;
    z-index: 1;
    display: grid;
    width: 100%;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.85rem;
    padding: 0.78rem 0.82rem 0.78rem 0.78rem;
    text-align: left;
    color: var(--color-text);
  }

  .liquid-trigger-emblem {
    position: relative;
    display: grid;
    height: 3rem;
    width: 3rem;
    place-items: center;
    overflow: hidden;
    border-radius: 1rem;
    background:
      linear-gradient(165deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.04) 65%),
      rgba(255, 255, 255, 0.06);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      0 14px 28px rgba(var(--shadow-rgb), 0.24);
  }

  .emblem-ring {
    position: absolute;
    inset: 0.36rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    animation: emblemPulse 3.8s ease-in-out infinite;
  }

  .emblem-ring-delay {
    inset: 0.6rem;
    opacity: 0.45;
    animation-delay: -1.9s;
  }

  .emblem-bars {
    position: relative;
    display: grid;
    gap: 0.26rem;
  }

  .emblem-bars span {
    display: block;
    height: 2px;
    width: 0.95rem;
    border-radius: 999px;
    background: currentColor;
  }

  .emblem-bars span:nth-child(2) {
    width: 0.68rem;
  }

  .liquid-trigger-copy {
    min-width: 0;
  }

  .liquid-trigger-kicker,
  .liquid-panel-kicker,
  .liquid-theme-row p {
    display: block;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.24em;
    opacity: 0.48;
    text-transform: uppercase;
  }

  .liquid-trigger-copy strong {
    display: block;
    font-size: 0.9rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .liquid-trigger-arrow {
    display: grid;
    height: 2.4rem;
    width: 2.4rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    transition:
      transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      background 0.32s ease,
      box-shadow 0.32s ease;
  }

  .liquid-trigger-arrow svg {
    height: 1rem;
    width: 1rem;
  }

  .liquid-trigger-arrow.is-open {
    transform: rotate(180deg) scale(1.04);
    background: rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
  }

  .liquid-panel {
    position: relative;
    z-index: 1;
    transform-origin: top left;
    padding: 0.15rem 0.82rem 0.88rem;
  }

  .liquid-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.25rem 0.18rem 0.92rem;
  }

  .liquid-panel-title {
    margin-top: 0.42rem;
    max-width: 15rem;
    font-size: 0.96rem;
    font-weight: 700;
    line-height: 1.45;
    opacity: 0.86;
  }

  .liquid-close {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.6rem 0.92rem;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    transition:
      transform 0.22s ease,
      background 0.22s ease;
  }

  .liquid-nav-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.72rem;
  }

  .liquid-nav-btn {
    display: flex;
    min-height: 4.9rem;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 1.45rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.06);
    padding: 0.9rem 0.95rem 0.82rem;
    text-align: left;
    transition:
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      background 0.28s ease,
      border-color 0.28s ease,
      box-shadow 0.28s ease;
  }

  .liquid-nav-btn:hover,
  .liquid-console-btn:hover,
  .liquid-compose-btn:hover,
  .liquid-close:hover,
  .theme-dot:hover {
    transform: translateY(-2px);
  }

  .liquid-nav-btn.is-active {
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0% 50%, var(--color-primary) 50% 100%);
    border-color: rgba(255, 255, 255, 0.34);
    box-shadow:
      0 16px 30px rgba(var(--shadow-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    color: var(--color-button-text);
  }

  .liquid-nav-label {
    font-size: 0.88rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .liquid-nav-hint {
    font-size: 0.68rem;
    font-weight: 700;
    opacity: 0.58;
  }

  .liquid-action-stack {
    display: grid;
    gap: 0.72rem;
    margin-top: 0.9rem;
  }

  .liquid-console-btn,
  .liquid-compose-btn {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-radius: 1.6rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 1rem 1rem 0.96rem;
    text-align: left;
    transition:
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.28s ease,
      background 0.28s ease;
  }

  .liquid-console-btn {
    background: rgba(255, 255, 255, 0.08);
  }

  .liquid-compose-btn {
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.14) 0% 50%, var(--color-primary) 50% 100%);
    color: var(--color-button-text);
    box-shadow:
      0 18px 34px rgba(var(--shadow-rgb), 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.34);
  }

  .liquid-console-btn:hover,
  .liquid-compose-btn:hover {
    box-shadow: 0 18px 34px rgba(var(--shadow-rgb), 0.2);
  }

  .liquid-action-copy {
    min-width: 0;
  }

  .liquid-action-copy strong {
    display: block;
    font-size: 0.84rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .liquid-action-copy small {
    display: block;
    margin-top: 0.34rem;
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.45;
    opacity: 0.72;
    text-transform: none;
  }

  .liquid-action-glyph {
    flex-shrink: 0;
    font-size: 1.3rem;
    font-weight: 900;
    opacity: 0.72;
  }

  .liquid-theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0.18rem 0.1rem;
  }

  .liquid-theme-dots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.72rem;
  }

  .theme-dot {
    position: relative;
    padding: 0.16rem;
    border-radius: 999px;
    transition: transform 0.22s ease;
  }

  .theme-dot::before {
    content: '';
    position: absolute;
    inset: -0.18rem;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.08);
    opacity: 0;
    transform: scale(0.78);
    transition:
      opacity 0.22s ease,
      transform 0.22s ease,
      border-color 0.22s ease;
  }

  .theme-dot.is-active::before {
    opacity: 1;
    transform: scale(1);
    border-color: rgba(255, 255, 255, 0.28);
  }

  .theme-dot-core {
    display: block;
    height: 1.72rem;
    width: 1.72rem;
    border-radius: inherit;
    background:
      linear-gradient(160deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.02) 62%),
      linear-gradient(135deg, var(--theme-color-a) 0 50%, var(--theme-color-b) 50% 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 10px 20px rgba(var(--shadow-rgb), 0.2);
  }

  .liquid-trigger:focus-visible,
  .liquid-close:focus-visible,
  .liquid-nav-btn:focus-visible,
  .liquid-console-btn:focus-visible,
  .liquid-compose-btn:focus-visible,
  .theme-dot:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.72);
    outline-offset: 3px;
  }

  @keyframes emblemPulse {
    0%,
    100% {
      transform: scale(0.92);
      opacity: 0.26;
    }

    50% {
      transform: scale(1.06);
      opacity: 0.58;
    }
  }

  @media (max-width: 640px) {
    .liquid-anchor {
      width: min(21rem, calc(100vw - 1rem));
    }

    .liquid-shell.is-collapsed {
      width: min(12rem, calc(100vw - 1.25rem));
    }

    .liquid-shell.is-expanded {
      width: min(21rem, calc(100vw - 1rem));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .liquid-shell,
    .liquid-core,
    .liquid-trigger-arrow,
    .liquid-nav-btn,
    .liquid-console-btn,
    .liquid-compose-btn,
    .liquid-close,
    .theme-dot,
    .theme-dot::before,
    .emblem-ring {
      animation: none !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
