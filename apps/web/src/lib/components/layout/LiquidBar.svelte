<script lang="ts">
  import { page } from '$app/state';
  import { getVisibleNavItems, isPathActive } from '$lib/components/layout/nav';

  export let className = '';
  export { className as class };
  export let isAuthenticated = false;
  export let isAdmin = false;

  let isExpanded = false;
  let panelRef: HTMLDivElement | null = null;
  let triggerRef: HTMLButtonElement | null = null;

  function isActive(href: string) {
    return isPathActive(page.url.pathname, href);
  }

  $: visibleNavItems = getVisibleNavItems(isAdmin);
  $: currentNav = visibleNavItems.find((item) => isActive(item.href)) ?? visibleNavItems[0];

  function toggle() {
    isExpanded = !isExpanded;
    if (isExpanded) {
      queueMicrotask(() => panelRef?.focus());
    }
  }

  function close() {
    isExpanded = false;
    queueMicrotask(() => triggerRef?.focus());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab' || !panelRef) return;

    const items = Array.from(
      panelRef.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

    if (!items.length) {
      event.preventDefault();
      panelRef.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!current || current === first || !panelRef.contains(current)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!current || current === last || !panelRef.contains(current)) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:document on:keydown={isExpanded ? handleKeydown : undefined} />

<nav id="liquidBar" class="liquid-anchor fixed z-[5100] select-none {className}" aria-label="快速导航">
  {#if isExpanded}
    <button
      type="button"
      class="liquid-backdrop is-visible"
      on:click={close}
      aria-label="导航背景"
    ></button>
  {/if}

  <div class="liquid-shell pointer-events-auto {isExpanded ? 'is-expanded' : 'is-collapsed'}">
    <div class="liquid-surface">
      <div class="liquid-surface-glow"></div>
      <div class="liquid-surface-noise"></div>
      <div class="liquid-shell-frame">
        <button
          bind:this={triggerRef}
          type="button"
          class="liquid-trigger"
          on:click={toggle}
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
            <span class="liquid-trigger-kicker">{currentNav.eyebrow}</span>
            <strong>{currentNav.label}</strong>
            <small>{currentNav.capsule}</small>
          </span>

          <span class="liquid-trigger-arrow {isExpanded ? 'is-open' : ''}" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 10l5 5 5-5"></path>
            </svg>
          </span>
        </button>

        {#if isExpanded}
          <div
            bind:this={panelRef}
            id="liquid-bar-panel"
            class="liquid-panel"
            role="dialog"
            aria-modal="true"
            aria-label="快速导航菜单"
            tabindex="-1"
          >
            <div class="liquid-panel-scroll">
              <div class="liquid-panel-head">
                <div>
                  <p class="liquid-panel-kicker">{currentNav.eyebrow}</p>
                  <p class="liquid-panel-title">{currentNav.detail}</p>
                </div>

                <button type="button" class="liquid-close" on:click={close}>
                  收起
                </button>
              </div>

              <section class="liquid-hero">
                <div class="liquid-hero-copy">
                  <p class="liquid-hero-kicker">当前入口</p>
                  <h2>{currentNav.label}</h2>
                  <p>{currentNav.detail}</p>
                </div>

                <div class="liquid-hero-badges" aria-hidden="true">
                  <span>{currentNav.capsule}</span>
                  <span>{currentNav.href}</span>
                </div>
              </section>

              <section class="liquid-section">
                <div class="liquid-section-head">
                  <p class="liquid-section-kicker">Quick jump</p>
                  <span>页面入口</span>
                </div>

                <div class="liquid-nav-grid">
                  {#each visibleNavItems as item}
                    <a
                      href={item.href}
                      class="liquid-nav-btn {isActive(item.href) ? 'is-active' : ''}"
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      on:click={close}
                    >
                      <span class="liquid-nav-label">{item.label}</span>
                      <span class="liquid-nav-hint">{item.short}</span>
                    </a>
                  {/each}
                </div>
              </section>

              <section class="liquid-section liquid-action-stack">
                <div class="liquid-section-head">
                  <p class="liquid-section-kicker">Utility actions</p>
                  <span>常用直达</span>
                </div>

                <div class="liquid-console-split">
                  <a href="/console/chats" class="liquid-console-btn is-primary" on:click={close}>
                    <span class="liquid-action-copy">
                      <strong>进入聊天</strong>
                      <small>直接前往 /console/chats 查看会话和未读消息。</small>
                    </span>
                    <span class="liquid-action-glyph" aria-hidden="true">↗</span>
                  </a>

                  <a href="/console/groups" class="liquid-console-btn" on:click={close}>
                    <span class="liquid-action-copy">
                      <strong>查看群组</strong>
                      <small>直接前往 /console/groups 处理发现、加入和群组入口。</small>
                    </span>
                    <span class="liquid-action-glyph" aria-hidden="true">↗</span>
                  </a>
                </div>

                <a href="/community" class="liquid-compose-btn" on:click={close}>
                  <span class="liquid-action-copy">
                    <strong>去社区发布</strong>
                    <small>{isAuthenticated ? '回到 /community 继续发布和浏览动态。' : '先前往 /login 登录，再回到 /community 发布内容。'}</small>
                  </span>
                  <span class="liquid-action-glyph" aria-hidden="true">+</span>
                </a>
              </section>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</nav>

<style>
  .liquid-anchor {
    top: max(env(safe-area-inset-top, 0px), 0.5rem);
    left: max(env(safe-area-inset-left, 0px), 0.5rem);
    width: min(24rem, calc(100vw - 1rem));
    pointer-events: none;
  }

  .liquid-backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    background:
      radial-gradient(circle at 8.5rem 7rem, rgba(var(--glow-primary-rgb, 249 115 22), 0.18), transparent 24%),
      radial-gradient(circle at 18rem 2rem, rgba(var(--glow-secondary-rgb, 96 165 250), 0.12), transparent 20%),
      linear-gradient(180deg, rgba(var(--shadow-rgb, 0 0 0), 0.14), rgba(var(--shadow-rgb, 0 0 0), 0.28));
    backdrop-filter: blur(10px) saturate(1.05);
  }

  .liquid-shell {
    position: relative;
    overflow: hidden;
    transform-origin: top left;
    transition: width 0.3s ease, height 0.3s ease;
  }

  .liquid-shell.is-collapsed {
    width: min(13.5rem, calc(100vw - 1rem));
    height: 5.15rem;
  }

  .liquid-shell.is-expanded {
    width: min(24rem, calc(100vw - 1rem));
    height: min(33rem, calc(100svh - 1rem));
    max-height: calc(100svh - 1rem);
  }

  .liquid-surface {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05) 42%, rgba(255, 255, 255, 0.08)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb, 12 18 28), 0.92), rgba(var(--color-bg-rgb, 12 18 28), 0.84));
    backdrop-filter: blur(22px) saturate(1.1);
    box-shadow:
      0 22px 48px rgba(var(--shadow-rgb, 0 0 0), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    isolation: isolate;
  }

  .liquid-shell.is-expanded .liquid-surface {
    border-radius: 2.25rem;
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
      radial-gradient(circle at 78% 18%, rgba(var(--glow-primary-rgb, 249 115 22), 0.22), transparent 26%),
      radial-gradient(circle at 62% 72%, rgba(var(--glow-secondary-rgb, 96 165 250), 0.16), transparent 32%);
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
    gap: 0.72rem;
    padding: 0.58rem;
  }

  .liquid-trigger {
    position: relative;
    display: grid;
    width: 100%;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.8rem;
    border-radius: 999px;
    padding: 0.68rem 0.72rem 0.68rem 0.7rem;
    text-align: left;
    color: var(--color-text, #f8fafc);
    background: rgba(255, 255, 255, 0.04);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      0 10px 22px rgba(var(--shadow-rgb, 0 0 0), 0.08);
  }

  .liquid-trigger-emblem {
    position: relative;
    display: grid;
    width: 3.25rem;
    height: 3.25rem;
    flex-shrink: 0;
    place-items: center;
    overflow: hidden;
    border-radius: 1.15rem;
    background:
      radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.34), transparent 34%),
      linear-gradient(155deg, rgba(var(--glow-primary-rgb, 249 115 22), 0.24), rgba(255, 255, 255, 0.05) 52%, rgba(var(--glow-secondary-rgb, 96 165 250), 0.2));
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
      radial-gradient(circle at 50% 50%, rgba(var(--glow-primary-rgb, 249 115 22), 0.28), transparent 58%),
      radial-gradient(circle at 70% 30%, rgba(255, 255, 255, 0.18), transparent 30%);
  }

  .liquid-emblem-shine {
    background: linear-gradient(115deg, transparent 24%, rgba(255, 255, 255, 0.36) 50%, transparent 74%);
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

  .emblem-bars span:nth-child(1) { width: 1.08rem; }
  .emblem-bars span:nth-child(2) { width: 0.74rem; }
  .emblem-bars span:nth-child(3) { width: 0.92rem; }

  .liquid-trigger-copy strong,
  .liquid-nav-label,
  .liquid-action-copy strong,
  .liquid-hero-copy h2 {
    display: block;
    font-weight: 900;
  }

  .liquid-trigger-kicker,
  .liquid-panel-kicker,
  .liquid-section-kicker,
  .liquid-hero-kicker {
    display: block;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    opacity: 0.52;
  }

  .liquid-trigger-copy small,
  .liquid-nav-hint,
  .liquid-action-copy small {
    opacity: 0.72;
  }

  .liquid-trigger-arrow {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    transition: transform 0.2s ease;
  }

  .liquid-trigger-arrow.is-open {
    transform: rotate(180deg);
  }

  .liquid-trigger-arrow svg {
    width: 1rem;
    height: 1rem;
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
  .liquid-section {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.8rem;
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .liquid-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
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

  .liquid-close,
  .liquid-nav-btn,
  .liquid-console-btn,
  .liquid-compose-btn {
    transition: transform 0.22s ease, border-color 0.22s ease, background 0.22s ease;
  }

  .liquid-close {
    border-radius: 999px;
    padding: 0.68rem 0.98rem;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.08);
  }

  .liquid-hero {
    padding: 1.15rem 1.05rem 1.08rem;
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
    background: rgba(255, 255, 255, 0.04);
    padding: 0.92rem 0.96rem 0.88rem;
    text-align: left;
  }

  .liquid-nav-btn.is-active,
  .liquid-compose-btn {
    color: var(--color-button-text, #fff7ed);
    background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #f97316) 88%, white 12%), var(--color-primary, #f97316));
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
    background: rgba(255, 255, 255, 0.06);
  }

  .liquid-console-btn.is-primary {
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  }

  .liquid-compose-btn {
    margin-top: 0.72rem;
  }

  .liquid-nav-btn:hover,
  .liquid-console-btn:hover,
  .liquid-compose-btn:hover,
  .liquid-close:hover {
    transform: translateY(-2px);
  }

  .liquid-trigger:focus-visible,
  .liquid-close:focus-visible,
  .liquid-nav-btn:focus-visible,
  .liquid-console-btn:focus-visible,
  .liquid-compose-btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.76);
    outline-offset: 3px;
  }

  @media (max-width: 640px) {
    .liquid-anchor {
      width: min(22rem, calc(100vw - 0.75rem));
    }

    .liquid-shell.is-collapsed {
      width: min(12.8rem, calc(100vw - 0.75rem));
      height: 4.95rem;
    }

    .liquid-shell.is-expanded {
      width: min(22rem, calc(100vw - 0.75rem));
      height: min(31rem, calc(100svh - 0.75rem));
      max-height: calc(100svh - 0.75rem);
    }

    .liquid-nav-grid {
      gap: 0.62rem;
    }
  }
</style>
