<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { gsap } from 'gsap';

  import { currentView, isAdmin, isAuthenticated } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';
  import { activeTheme, themeCatalog } from '../../stores/theme';

  let className = '';
  export { className as class };

  let isExpanded = false;
  let isPanelMounted = false;
  let isAnimating = false;
  let pendingAfterClose: (() => void) | null = null;
  let suppressNextTriggerClick = false;

  let shellRef: HTMLDivElement;
  let surfaceRef: HTMLDivElement;
  let panelRef: HTMLDivElement | null = null;
  let triggerRef: HTMLButtonElement | null = null;
  let triggerArrowRef: HTMLSpanElement | null = null;
  let backdropRef: HTMLButtonElement | null = null;

  let prefersReducedMotion = false;
  let activeTimeline: gsap.core.Timeline | null = null;
  let reducedMotionQuery: MediaQueryList | null = null;

  const viewCopy: Record<string, { eyebrow: string; detail: string; short: string; capsule: string }> = {
    community: {
      eyebrow: '8community',
      detail: '广场动态、发帖入口和日常互动被重组为一块更顺手的液态面板。',
      short: '看近况',
      capsule: '社交流动'
    },
    console: {
      eyebrow: 'main console',
      detail: '聊天、群组、网盘和提醒现在都能从这里一抬手切进去。',
      short: '开消息台',
      capsule: '消息中枢'
    },
    schedule: {
      eyebrow: 'today flow',
      detail: '今天的课程、提醒和节奏，被压成一块更安静的导航触点。',
      short: '看安排',
      capsule: '今日节奏'
    },
    xiangqi: {
      eyebrow: 'slow game',
      detail: '想从信息流里抽身，就让这块面板直接把你送进棋局。',
      short: '开一局',
      capsule: '慢一点'
    },
    nodes: {
      eyebrow: 'proxy hub',
      detail: '代理节点、订阅导出和客户端入口收成一条更干净的路径。',
      short: '开节点',
      capsule: '通道切换'
    },
    admin: {
      eyebrow: 'control room',
      detail: '后台入口、巡检开关和管理视角被放进同一块控制台表面。',
      short: '巡一下',
      capsule: '管理视角'
    }
  };

  $: views = [
    { id: 'community', label: '社区' },
    { id: 'console', label: '消息台' },
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

  function getPanelItems(selector: string) {
    if (!panelRef) {
      return [] as HTMLElement[];
    }

    return Array.from(panelRef.querySelectorAll<HTMLElement>(selector));
  }

  function getMotionItems() {
    return getPanelItems('[data-liquid-motion]');
  }

  function getFocusablePanelItems() {
    return getPanelItems('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])').filter(
      (element) => element.getAttribute('aria-hidden') !== 'true'
    );
  }

  function focusFirstPanelItem() {
    const focusableItems = getFocusablePanelItems();
    focusableItems[0]?.focus();
  }

  function flushPendingAfterClose() {
    const next = pendingAfterClose;
    pendingAfterClose = null;
    next?.();
  }

  function runAfterClose(callback?: () => void) {
    if (!callback) return;

    pendingAfterClose = callback;

    if (!isExpanded && !isPanelMounted && !isAnimating) {
      flushPendingAfterClose();
    }
  }

  function clearAnimatedProps() {
    if (shellRef) {
      gsap.set(shellRef, { clearProps: 'width,height,filter,willChange' });
    }

    if (surfaceRef) {
      gsap.set(surfaceRef, { clearProps: 'borderRadius,willChange' });
    }

    if (triggerArrowRef) {
      gsap.set(triggerArrowRef, { clearProps: 'rotate,willChange' });
    }

    if (backdropRef) {
      gsap.set(backdropRef, { clearProps: 'opacity,willChange' });
    }

    const motionItems = getMotionItems();
    if (motionItems.length > 0) {
      gsap.set(motionItems, { clearProps: 'opacity,transform,filter,willChange' });
    }
  }

  function killActiveTimeline() {
    if (activeTimeline) {
      activeTimeline.kill();
      activeTimeline = null;
    }
  }

  function finishClose() {
    killActiveTimeline();
    isAnimating = false;
    isPanelMounted = false;
    clearAnimatedProps();
    triggerRef?.focus();
    flushPendingAfterClose();
  }

  async function openLiquidBar() {
    if (isExpanded || isAnimating) {
      return;
    }

    pendingAfterClose = null;
    killActiveTimeline();

    const fromRect = shellRef?.getBoundingClientRect();

    isExpanded = true;
    isPanelMounted = true;
    await tick();

    if (!shellRef || !surfaceRef || !panelRef) {
      isAnimating = false;
      return;
    }

    focusFirstPanelItem();

    if (prefersReducedMotion) {
      clearAnimatedProps();
      return;
    }

    const toRect = shellRef.getBoundingClientRect();
    const motionItems = getMotionItems();

    gsap.set(shellRef, {
      width: fromRect?.width || toRect.width,
      height: fromRect?.height || toRect.height,
      filter: 'saturate(0.94)',
      willChange: 'width,height,filter'
    });
    gsap.set(surfaceRef, {
      borderRadius: '999px',
      willChange: 'border-radius'
    });
    gsap.set(backdropRef, {
      opacity: 0,
      willChange: 'opacity'
    });
    gsap.set(triggerArrowRef, {
      rotate: 0,
      willChange: 'transform'
    });
    gsap.set(motionItems, {
      opacity: 0,
      y: 18,
      filter: 'blur(12px)',
      willChange: 'transform,opacity,filter'
    });

    isAnimating = true;

    activeTimeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        isAnimating = false;
        activeTimeline = null;
        clearAnimatedProps();
      }
    });

    activeTimeline
      .to(backdropRef, {
        opacity: 1,
        duration: 0.34,
        ease: 'power2.out'
      }, 0)
      .to(shellRef, {
        width: toRect.width,
        height: toRect.height,
        filter: 'saturate(1.04)',
        duration: 0.58,
        ease: 'power3.out'
      }, 0)
      .to(surfaceRef, {
        borderRadius: 36,
        duration: 0.58,
        ease: 'power3.out'
      }, 0)
      .to(triggerArrowRef, {
        rotate: 180,
        duration: 0.5,
        ease: 'power3.out'
      }, 0.02)
      .to(motionItems, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.42,
        ease: 'power3.out',
        stagger: 0.045,
        clearProps: 'opacity,transform,filter'
      }, 0.14);
  }

  async function closeLiquidBar(afterClose?: () => void) {
    if (afterClose) {
      pendingAfterClose = afterClose;
    }

    if (!isExpanded && !isPanelMounted && !isAnimating) {
      runAfterClose(afterClose);
      return;
    }

    killActiveTimeline();

    if (afterClose) {
      isExpanded = false;
      isPanelMounted = false;
      isAnimating = false;
      clearAnimatedProps();
      flushPendingAfterClose();
      return;
    }

    if (!shellRef || !surfaceRef) {
      isExpanded = false;
      finishClose();
      return;
    }

    if (prefersReducedMotion) {
      isExpanded = false;
      await tick();
      finishClose();
      return;
    }

    const fromRect = shellRef.getBoundingClientRect();
    isExpanded = false;
    await tick();

    if (!shellRef || !surfaceRef) {
      finishClose();
      return;
    }

    const toRect = shellRef.getBoundingClientRect();
    const motionItems = getMotionItems();

    gsap.set(shellRef, {
      width: fromRect.width,
      height: fromRect.height,
      filter: 'saturate(1.02)',
      willChange: 'width,height,filter'
    });
    gsap.set(surfaceRef, {
      borderRadius: 36,
      willChange: 'border-radius'
    });
    gsap.set(backdropRef, {
      opacity: 1,
      willChange: 'opacity'
    });
    gsap.set(triggerArrowRef, {
      rotate: 180,
      willChange: 'transform'
    });
    gsap.set(motionItems, {
      willChange: 'transform,opacity,filter'
    });

    isAnimating = true;

    activeTimeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: finishClose
    });

    activeTimeline
      .to(motionItems, {
        opacity: 0,
        y: 10,
        filter: 'blur(10px)',
        duration: 0.18,
        ease: 'power2.in',
        stagger: {
          each: 0.028,
          from: 'end'
        }
      }, 0)
      .to(backdropRef, {
        opacity: 0,
        duration: 0.22,
        ease: 'power2.out'
      }, 0)
      .to(triggerArrowRef, {
        rotate: 0,
        duration: 0.36,
        ease: 'power2.inOut'
      }, 0.03)
      .to(surfaceRef, {
        borderRadius: 999,
        duration: 0.44,
        ease: 'power3.inOut'
      }, 0.04)
      .to(shellRef, {
        width: toRect.width,
        height: toRect.height,
        filter: 'saturate(0.98)',
        duration: 0.44,
        ease: 'power3.inOut'
      }, 0.04);
  }

  function handleTriggerClick() {
    if (suppressNextTriggerClick) {
      suppressNextTriggerClick = false;
      return;
    }

    if (isExpanded || isAnimating) {
      return;
    }

    void openLiquidBar();
  }

  function handleTriggerTouchStart(event: TouchEvent) {
    event.preventDefault();
    suppressNextTriggerClick = true;
  }

  function handleTriggerTouchEnd(event: TouchEvent) {
    event.preventDefault();

    if (!isExpanded && !isAnimating) {
      void openLiquidBar();
    }
  }

  function closeLiquidBarFromKeyboard() {
    void closeLiquidBar(() => {
      triggerRef?.focus();
    });
  }

  function handlePanelKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLiquidBarFromKeyboard();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableItems = getFocusablePanelItems();
    if (focusableItems.length === 0) {
      event.preventDefault();
      triggerRef?.focus();
      return;
    }

    const firstItem = focusableItems[0];
    const lastItem = focusableItems[focusableItems.length - 1];
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!current || current === firstItem || !panelRef?.contains(current)) {
        event.preventDefault();
        lastItem.focus();
      }
      return;
    }

    if (!current || current === lastItem || !panelRef?.contains(current)) {
      event.preventDefault();
      firstItem.focus();
    }
  }

  function handleNav(id: string) {
    void closeLiquidBar(() => {
      currentView.set(id);
    });
  }

  function requestTheme(id: string, e: MouseEvent) {
    window.dispatchEvent(
      new CustomEvent('request-theme-switch', {
        detail: { id, x: e.clientX, y: e.clientY }
      })
    );
  }

  function openConsoleTab(tab: 'account' | 'chats') {
    void closeLiquidBar(() => {
      setCommunityConsoleState({ tab, conversationId: '', returnFocusSelector: '[data-console-launch="liquid-tab"]' });
      window.dispatchEvent(
        new CustomEvent('community-console-tab-request', {
          detail: { tab }
        })
      );
      openModal('community-console');
    });
  }

  function openComposer() {
    void closeLiquidBar(() => {
      openModal($isAuthenticated ? 'comm-post' : 'auth');
    });
  }

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isExpanded || !shellRef) {
        return;
      }

      if (!shellRef.contains(event.target as Node)) {
        void closeLiquidBar();
      }
    };

    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = reducedMotionQuery.matches;

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
    };

    const handleDocumentKeydown = (event: KeyboardEvent) => {
      if (!isPanelMounted || !panelRef) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeLiquidBarFromKeyboard();
        return;
      }

      if (event.key === 'Tab') {
        handlePanelKeydown(event);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleDocumentKeydown);

    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    } else {
      reducedMotionQuery.addListener(handleReducedMotionChange);
    }

    return () => {
      killActiveTimeline();
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleDocumentKeydown);

      if (!reducedMotionQuery) {
        return;
      }

      if (typeof reducedMotionQuery.removeEventListener === 'function') {
        reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      } else {
        reducedMotionQuery.removeListener(handleReducedMotionChange);
      }
    };
  });
</script>

<nav
  id="liquidBar"
  class="liquid-anchor fixed z-[5100] select-none {className}"
  aria-label="快速导航"
>
  {#if isPanelMounted}
    <button
      bind:this={backdropRef}
      type="button"
      class="liquid-backdrop {isExpanded ? 'is-visible' : ''}"
      on:click={() => closeLiquidBar()}
      aria-label="导航背景"
    ></button>
  {/if}

  <div bind:this={shellRef} class="liquid-shell pointer-events-auto {isExpanded ? 'is-expanded' : 'is-collapsed'}">
    <div bind:this={surfaceRef} class="liquid-surface">
      <div class="liquid-surface-glow"></div>
      <div class="liquid-surface-noise"></div>
      <div class="liquid-shell-frame">
        <button
          bind:this={triggerRef}
          type="button"
          class="liquid-trigger"
          on:click={handleTriggerClick}
          on:touchstart={handleTriggerTouchStart}
          on:touchend={handleTriggerTouchEnd}
          aria-expanded={isExpanded}
          aria-controls="liquid-bar-panel"
          aria-haspopup="dialog"
        >
          <span class="liquid-trigger-emblem" aria-hidden="true">
            <span class="liquid-emblem-aura"></span>
            <span class="liquid-emblem-shine"></span>
            <span class="emblem-bars">
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

          <span bind:this={triggerArrowRef} class="liquid-trigger-arrow {isExpanded ? 'is-open' : ''}" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 10l5 5 5-5"></path>
            </svg>
          </span>
        </button>

        {#if isPanelMounted}
          <div
            bind:this={panelRef}
            id="liquid-bar-panel"
            class="liquid-panel"
            role="dialog"
            aria-modal="true"
            aria-label="液态导航菜单"
            tabindex="-1"
          >
            <div class="liquid-panel-scroll">
              <div class="liquid-panel-head" data-liquid-motion>
                <div>
                  <p class="liquid-panel-kicker">{currentViewMood.eyebrow}</p>
                  <p class="liquid-panel-title">{currentViewMood.detail}</p>
                </div>

                <button type="button" class="liquid-close" on:click={() => closeLiquidBar()}>
                  收起
                </button>
              </div>

              <section class="liquid-hero" data-liquid-motion>
                <div class="liquid-hero-copy">
                  <p class="liquid-hero-kicker">Current capsule</p>
                  <h2>{currentViewLabel}</h2>
                  <p>{currentViewMood.detail}</p>
                </div>

                <div class="liquid-hero-badges" aria-hidden="true">
                  <span>{currentViewMood.capsule}</span>
                  <span>Liquid dock</span>
                </div>
              </section>

              <section class="liquid-section" data-liquid-motion>
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
                      data-liquid-motion
                    >
                      <span class="liquid-nav-label">{view.label}</span>
                      <span class="liquid-nav-hint">{viewCopy[view.id]?.short || '进入'}</span>
                    </button>
                  {/each}
                </div>
              </section>

              <section class="liquid-section liquid-action-stack" data-liquid-motion>
                <div class="liquid-section-head">
                  <p class="liquid-section-kicker">Utility actions</p>
                  <span>快捷处理</span>
                </div>

                <div class="liquid-console-split">
                  <button type="button" data-console-launch="liquid-account" class="liquid-console-btn is-primary" aria-label="个人面板" on:click={() => openConsoleTab('account')}>
                    <span class="liquid-action-copy">
                      <strong>账号资料</strong>
                      <small>资料、头像和账号设置单独进。</small>
                    </span>
                    <span class="liquid-action-glyph" aria-hidden="true">◦</span>
                  </button>

                  <button type="button" data-console-launch="liquid-tab" class="liquid-console-btn" on:click={() => openConsoleTab('chats')}>
                    <span class="liquid-action-copy">
                      <strong>消息选项卡</strong>
                      <small>聊天、群组、网盘和提醒分栏进入。</small>
                    </span>
                    <span class="liquid-action-glyph" aria-hidden="true">↗</span>
                  </button>
                </div>

                {#if $currentView === 'community'}
                  <button type="button" class="liquid-compose-btn" on:click={openComposer} data-liquid-motion>
                    <span class="liquid-action-copy">
                      <strong>+ 发一条</strong>
                      <small>{$isAuthenticated ? '把刚发生的事直接丢到广场。' : '先登录，再把近况发出去。'}</small>
                    </span>
                    <span class="liquid-action-glyph" aria-hidden="true">+</span>
                  </button>
                {/if}
              </section>
            </div>

            <div class="liquid-theme-row" data-liquid-motion>
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
  </div>
</nav>

<style>
  .liquid-anchor {
    top: max(env(safe-area-inset-top, 0px), 0.9rem);
    left: max(env(safe-area-inset-left, 0px), 0.9rem);
    width: min(24rem, calc(100vw - 1.8rem));
    pointer-events: none;
  }

  .liquid-backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    background:
      radial-gradient(circle at 8.5rem 7rem, rgba(var(--glow-primary-rgb), 0.18), transparent 24%),
      radial-gradient(circle at 18rem 2rem, rgba(var(--glow-secondary-rgb), 0.12), transparent 20%),
      linear-gradient(180deg, rgba(var(--shadow-rgb), 0.14), rgba(var(--shadow-rgb), 0.28));
    backdrop-filter: blur(10px) saturate(1.05);
    opacity: 0;
    pointer-events: none;
  }

  .liquid-backdrop.is-visible {
    pointer-events: auto;
  }

  .liquid-shell {
    position: relative;
    overflow: hidden;
    transform-origin: top left;
  }

  .liquid-shell.is-collapsed {
    width: min(13.5rem, calc(100vw - 1.8rem));
    height: 5rem;
  }

  .liquid-shell.is-expanded {
    width: min(24rem, calc(100vw - 1.8rem));
    height: min(33rem, calc(100svh - 1.8rem));
    max-height: calc(100svh - 1.8rem);
  }

  .liquid-surface {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05) 42%, rgba(255, 255, 255, 0.09)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.9), rgba(var(--color-bg-rgb), 0.82));
    backdrop-filter: blur(20px) saturate(1.08);
    box-shadow:
      0 18px 42px rgba(var(--shadow-rgb), 0.18),
      0 6px 16px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    isolation: isolate;
  }

  .liquid-shell.is-expanded .liquid-surface {
    border-radius: 2.1rem;
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow:
      0 28px 64px rgba(var(--shadow-rgb), 0.24),
      0 10px 24px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .liquid-surface-glow,
  .liquid-surface-noise {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .liquid-surface-glow {
    background:
      radial-gradient(circle at 14% 12%, rgba(255, 255, 255, 0.22), transparent 28%),
      radial-gradient(circle at 78% 18%, rgba(var(--glow-primary-rgb), 0.22), transparent 26%),
      radial-gradient(circle at 62% 72%, rgba(var(--glow-secondary-rgb), 0.16), transparent 32%);
    opacity: 0.96;
  }

  .liquid-surface-noise {
    background:
      linear-gradient(125deg, rgba(255, 255, 255, 0.16), transparent 26%),
      linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.1));
    mix-blend-mode: screen;
    opacity: 0.68;
  }

  .liquid-shell-frame {
    position: relative;
    z-index: 1;
    display: flex;
    height: 100%;
    flex-direction: column;
    gap: 0.68rem;
    padding: 0.52rem;
  }

  .liquid-trigger {
    position: relative;
    display: grid;
    width: 100%;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.64rem 0.68rem 0.64rem 0.64rem;
    text-align: left;
    color: var(--color-text);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
      rgba(var(--color-bg-rgb), 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 10px 22px rgba(var(--shadow-rgb), 0.08);
    transition:
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.22s ease,
      background 0.22s ease,
      box-shadow 0.22s ease;
  }

  .liquid-trigger-emblem {
    position: relative;
    display: grid;
    width: 3.12rem;
    height: 3.12rem;
    flex-shrink: 0;
    place-items: center;
    overflow: hidden;
    border-radius: 1rem;
    background:
      radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.3), transparent 34%),
      linear-gradient(155deg, rgba(var(--glow-primary-rgb), 0.22), rgba(255, 255, 255, 0.05) 52%, rgba(var(--glow-secondary-rgb), 0.18));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 10px 20px rgba(var(--shadow-rgb), 0.12);
  }

  .liquid-emblem-aura,
  .liquid-emblem-shine {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }

  .liquid-emblem-aura {
    background:
      radial-gradient(circle at 50% 50%, rgba(var(--glow-primary-rgb), 0.28), transparent 58%),
      radial-gradient(circle at 70% 30%, rgba(255, 255, 255, 0.18), transparent 30%);
    animation: liquidAuraFloat 5.8s ease-in-out infinite;
  }

  .liquid-emblem-shine {
    background: linear-gradient(115deg, transparent 24%, rgba(255, 255, 255, 0.36) 50%, transparent 74%);
    transform: translateX(-140%);
    animation: liquidSheen 4.8s linear infinite;
    opacity: 0.8;
  }

  .emblem-bars {
    position: relative;
    display: grid;
    gap: 0.28rem;
    z-index: 1;
  }

  .emblem-bars span {
    display: block;
    height: 2px;
    border-radius: 999px;
    background: rgba(255, 244, 237, 0.96);
  }

  .emblem-bars span:nth-child(1) {
    width: 1.08rem;
  }

  .emblem-bars span:nth-child(2) {
    width: 0.74rem;
  }

  .emblem-bars span:nth-child(3) {
    width: 0.92rem;
  }

  .liquid-trigger-copy {
    min-width: 0;
  }

  .liquid-trigger-kicker,
  .liquid-panel-kicker,
  .liquid-section-kicker,
  .liquid-theme-row p,
  .liquid-hero-kicker {
    display: block;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    opacity: 0.52;
  }

  .liquid-trigger-copy strong {
    display: block;
    margin-top: 0.08rem;
    font-size: 0.96rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .liquid-trigger-copy small {
    display: block;
    margin-top: 0.18rem;
    font-size: 0.68rem;
    font-weight: 700;
    opacity: 0.66;
  }

  .liquid-trigger-arrow {
    display: grid;
    width: 2.35rem;
    height: 2.35rem;
    place-items: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
    transition:
      transform 0.36s cubic-bezier(0.22, 1, 0.36, 1),
      background 0.28s ease,
      box-shadow 0.28s ease,
      border-color 0.28s ease;
  }

  .liquid-trigger-arrow svg {
    width: 1rem;
    height: 1rem;
  }

  .liquid-trigger-arrow.is-open {
    transform: rotate(180deg);
    background: rgba(255, 255, 255, 0.14);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      0 10px 18px rgba(var(--shadow-rgb), 0.1);
  }

  .liquid-panel {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.78rem;
    overflow: hidden;
  }

  .liquid-panel-scroll {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.78rem;
    overflow: auto;
    padding-right: 0.12rem;
  }

  .liquid-panel-head,
  .liquid-hero,
  .liquid-section,
  .liquid-theme-row {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04)),
      rgba(var(--color-bg-rgb), 0.06);
    box-shadow:
      0 12px 28px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .liquid-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-radius: 1.8rem;
    padding: 1rem 1rem 0.96rem;
  }

  .liquid-panel-title {
    margin-top: 0.45rem;
    max-width: 15.5rem;
    font-size: 0.96rem;
    font-weight: 700;
    line-height: 1.5;
    opacity: 0.88;
  }

  .liquid-close {
    flex-shrink: 0;
    border-radius: 999px;
    padding: 0.68rem 0.98rem;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.08);
    transition:
      transform 0.22s ease,
      background 0.22s ease,
      box-shadow 0.22s ease;
  }

  .liquid-hero {
    position: relative;
    overflow: hidden;
    border-radius: 2rem;
    padding: 1.15rem 1.05rem 1.08rem;
    background:
      radial-gradient(circle at 86% 18%, rgba(var(--glow-primary-rgb), 0.24), transparent 26%),
      radial-gradient(circle at 16% 88%, rgba(var(--glow-secondary-rgb), 0.16), transparent 28%),
      linear-gradient(145deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  }

  .liquid-hero::after {
    content: '';
    position: absolute;
    inset: auto -12% -34% 42%;
    height: 8rem;
    border-radius: 999px;
    background: rgba(var(--glow-primary-rgb), 0.2);
    filter: blur(34px);
    opacity: 0.72;
    pointer-events: none;
  }

  .liquid-hero-copy {
    position: relative;
    z-index: 1;
  }

  .liquid-hero-copy h2 {
    margin-top: 0.28rem;
    font-size: 1.55rem;
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .liquid-hero-copy p:last-child {
    margin-top: 0.48rem;
    max-width: 15rem;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.5;
    opacity: 0.78;
  }

  .liquid-hero-badges {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.78rem;
  }

  .liquid-hero-badges span,
  .liquid-section-head span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.8rem;
    border-radius: 999px;
    padding: 0.34rem 0.68rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.84;
  }

  .liquid-section {
    border-radius: 1.9rem;
    padding: 0.9rem;
  }

  .liquid-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.72rem;
  }

  .liquid-nav-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .liquid-nav-btn {
    display: flex;
    min-height: 5.25rem;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 1.45rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04)),
      rgba(255, 255, 255, 0.04);
    padding: 0.92rem 0.96rem 0.88rem;
    text-align: left;
    transition:
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      border-color 0.22s ease,
      background 0.22s ease,
      box-shadow 0.22s ease;
  }

  .liquid-nav-btn.is-active {
    color: var(--color-button-text);
    border-color: color-mix(in srgb, var(--color-primary) 72%, white 28%);
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.28), transparent 42%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 88%, white 12%), var(--color-primary));
    box-shadow:
      0 16px 30px rgba(var(--shadow-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.42);
  }

  .liquid-nav-label {
    font-size: 0.9rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .liquid-nav-hint {
    font-size: 0.68rem;
    font-weight: 800;
    opacity: 0.6;
  }

  .liquid-action-stack {
    gap: 0;
  }

  .liquid-console-split {
    display: grid;
    gap: 0.72rem;
  }

  .liquid-console-btn,
  .liquid-compose-btn {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-radius: 1.65rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.98rem 1rem 0.96rem;
    text-align: left;
    transition:
      transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.24s ease,
      background 0.24s ease,
      border-color 0.24s ease;
  }

  .liquid-console-btn {
    background: rgba(255, 255, 255, 0.06);
  }

  .liquid-console-btn.is-primary {
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.22), transparent 42%),
      linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04)),
      rgba(255, 255, 255, 0.06);
  }

  .liquid-compose-btn {
    margin-top: 0.72rem;
    color: var(--color-button-text);
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.28), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 88%, white 12%), var(--color-primary));
    box-shadow:
      0 18px 34px rgba(var(--shadow-rgb), 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.34);
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
    gap: 0.9rem;
    margin-top: auto;
    border-radius: 1.5rem;
    padding: 0.82rem 0.94rem;
  }

  .liquid-theme-dots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.68rem;
  }

  .theme-dot {
    position: relative;
    padding: 0.16rem;
    border-radius: 999px;
    transition:
      transform 0.22s ease,
      filter 0.22s ease;
  }

  .theme-dot::before {
    content: '';
    position: absolute;
    inset: -0.18rem;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.08);
    opacity: 0;
    transform: scale(0.8);
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
    width: 1.72rem;
    height: 1.72rem;
    border-radius: inherit;
    background:
      linear-gradient(160deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.02) 62%),
      radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.24), transparent 38%),
      linear-gradient(135deg, var(--theme-color-a), var(--theme-color-b));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 8px 18px rgba(var(--shadow-rgb), 0.18);
  }

  .liquid-trigger:hover,
  .liquid-nav-btn:hover,
  .liquid-console-btn:hover,
  .liquid-compose-btn:hover,
  .liquid-close:hover,
  .theme-dot:hover {
    transform: translateY(-2px);
  }

  .liquid-trigger:hover,
  .liquid-close:hover,
  .liquid-console-btn:hover,
  .liquid-nav-btn:hover,
  .theme-dot:hover {
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow:
      0 14px 28px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  .liquid-trigger:focus-visible,
  .liquid-close:focus-visible,
  .liquid-nav-btn:focus-visible,
  .liquid-console-btn:focus-visible,
  .liquid-compose-btn:focus-visible,
  .theme-dot:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.76);
    outline-offset: 3px;
  }

  @keyframes liquidAuraFloat {
    0%,
    100% {
      transform: scale(0.92);
      opacity: 0.78;
    }

    50% {
      transform: scale(1.08);
      opacity: 1;
    }
  }

  @keyframes liquidSheen {
    0% {
      transform: translateX(-140%);
    }

    100% {
      transform: translateX(140%);
    }
  }

  @media (max-width: 640px) {
    .liquid-anchor {
      top: max(env(safe-area-inset-top, 0px), 0.7rem);
      left: max(env(safe-area-inset-left, 0px), 0.7rem);
      width: min(22rem, calc(100vw - 1.4rem));
    }

    .liquid-shell.is-collapsed {
      width: min(12.8rem, calc(100vw - 1.4rem));
      height: 4.85rem;
    }

    .liquid-shell.is-expanded {
      width: min(22rem, calc(100vw - 1.4rem));
      height: min(31rem, calc(100svh - 1.4rem));
      max-height: calc(100svh - 1.4rem);
    }

    .liquid-shell-frame {
      padding: 0.46rem;
      gap: 0.62rem;
    }

    .liquid-trigger {
      gap: 0.66rem;
      padding: 0.6rem;
    }

    .liquid-trigger-emblem {
      width: 2.9rem;
      height: 2.9rem;
      border-radius: 0.95rem;
    }

    .liquid-hero-copy h2 {
      font-size: 1.4rem;
    }

    .liquid-panel-head,
    .liquid-hero,
    .liquid-section {
      border-radius: 1.55rem;
    }

    .liquid-nav-grid {
      gap: 0.62rem;
    }

    .liquid-nav-btn {
      min-height: 4.75rem;
      border-radius: 1.25rem;
      padding: 0.84rem;
    }

    .liquid-theme-row {
      border-radius: 1.1rem;
      padding: 0.76rem 0.82rem;
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .liquid-trigger-arrow,
    .liquid-nav-btn,
    .liquid-console-btn,
    .liquid-compose-btn,
    .liquid-close,
    .theme-dot,
    .theme-dot::before,
    .liquid-emblem-aura,
    .liquid-emblem-shine {
      animation: none !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
