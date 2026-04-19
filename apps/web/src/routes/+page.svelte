<svelte:head>
  <title>Schedule Guiyang</title>
  <meta
    name="description"
    content="Schedule Guiyang 的新首页入口，把社区、消息台、课表和节点这些真实路由收成一套可直接进入的 landing shell。"
  />
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { readStoredCommunitySession, type CommunitySession } from '$lib/api/communityAuth';
  import { getVisibleNavItems } from '$lib/components/layout/nav';

  type QuickAction = {
    href: string;
    title: string;
    detail: string;
    badge: string;
  };

  const entryCards = getVisibleNavItems(false);

  const quickActions: QuickAction[] = [
    {
      href: '/community',
      title: '进入社区广场',
      detail: '保留动态流、帖子详情和个人页的真实 URL，作为旧首页默认入口的承接面。',
      badge: 'Community'
    },
    {
      href: '/console',
      title: '打开消息台',
      detail: '账号、私聊、群组和提醒收束到真实路由，后续再继续拆细 console 子页。',
      badge: 'Console'
    },
    {
      href: '/schedule',
      title: '查看今日课表',
      detail: '把原来的课表触点提前到首页，让日常入口先有稳定的深链地址。',
      badge: 'Schedule'
    }
  ];

  let session = $state<CommunitySession | null>(null);
  let displayName = $derived(session?.username?.trim() || '访客');
  let heroLabel = $derived(session ? '继续你的首页入口' : '真实首页已经上线');
  let heroCopy = $derived(
    session
      ? '直接从这里回到社区、消息台和课表，不再停留在 migration scaffold。'
      : '首页已经从迁移占位页切到真实入口壳层，先把常用路由、入口状态和深链行为稳定下来。'
  );

  onMount(() => {
    session = readStoredCommunitySession();
  });
</script>

<section class="home-shell">
  <div class="home-grid">
    <section class="hero-card route-shell" aria-labelledby="home-title">
      <p class="route-kicker">public landing shell</p>
      <div class="hero-head">
        <div>
          <p class="hero-label">{heroLabel}</p>
          <h1 id="home-title">Schedule Guiyang 的新首页入口</h1>
        </div>
        <div class="hero-pill" aria-label="当前访客状态">
          <span class="hero-pill__label">访客状态</span>
          <strong>{displayName}</strong>
        </div>
      </div>

      <p class="hero-copy">{heroCopy}</p>

      <div class="hero-actions" aria-label="首页主入口">
        <a href="/community" class="hero-primary">进入社区</a>
        <a href="/console" class="hero-secondary">打开消息台</a>
      </div>

      <dl class="hero-stats" aria-label="本次 cutover 目标">
        <div>
          <dt>Route-first</dt>
          <dd>首页入口改成真实 URL</dd>
        </div>
        <div>
          <dt>Shell parity</dt>
          <dd>保留壁纸、预载和液态导航</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>继续补齐各入口内部功能</dd>
        </div>
      </dl>
    </section>

    <section class="entry-strip" aria-labelledby="entry-strip-title">
      <div class="entry-strip__head">
        <p class="route-kicker">core routes</p>
        <h2 id="entry-strip-title">把首页先还原成可进入的新站壳层</h2>
      </div>

      <div class="entry-grid">
        {#each entryCards as card}
          <a href={card.href} class="entry-card">
            <span class="entry-card__eyebrow">{card.eyebrow}</span>
            <strong>{card.label}</strong>
            <p>{card.detail}</p>
            <span class="entry-card__cta">{card.short}</span>
          </a>
        {/each}
      </div>
    </section>

    <section class="support-grid" aria-label="首页补充入口">
      <article class="support-card">
        <p class="route-kicker">quick actions</p>
        <ul class="action-list">
          {#each quickActions as action}
            <li>
              <a href={action.href}>
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
                <em>{action.badge}</em>
              </a>
            </li>
          {/each}
        </ul>
      </article>

      <article class="support-card support-card--notes">
        <p class="route-kicker">migration status</p>
        <h2>首页不再假装自己只是迁移脚手架。</h2>
        <p>
          这次 cutover 只把 public root 换成真实入口体验，复用现有 Header、LiquidBar、壁纸和预载壳层；
          各二级页面继续按单元逐步从旧站实现迁过来。
        </p>
      </article>
    </section>
  </div>
</section>

<style>
  .home-shell {
    min-height: calc(100vh - 16rem);
  }

  .home-grid {
    display: grid;
    gap: 1.25rem;
  }

  .hero-card {
    padding: clamp(1.4rem, 2vw, 2rem);
    overflow: hidden;
    background:
      radial-gradient(circle at top right, rgba(var(--glow-primary-rgb), 0.18), transparent 26%),
      radial-gradient(circle at 18% 82%, rgba(var(--glow-secondary-rgb), 0.14), transparent 24%),
      rgba(8, 15, 26, 0.48);
  }

  .hero-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .hero-label {
    font-size: 0.82rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.72;
  }

  .hero-copy {
    max-width: 46rem;
    margin-top: 1rem;
    font-size: 1rem;
    line-height: 1.75;
  }

  .hero-pill {
    min-width: 10rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.4rem;
    padding: 0.9rem 1rem;
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(16px);
  }

  .hero-pill__label {
    display: block;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    opacity: 0.58;
  }

  .hero-pill strong {
    display: block;
    margin-top: 0.45rem;
    font-size: 1.05rem;
    font-weight: 900;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 1.4rem;
  }

  .hero-primary,
  .hero-secondary,
  .entry-card,
  .action-list a {
    transition:
      transform 0.22s ease,
      border-color 0.22s ease,
      background 0.22s ease,
      box-shadow 0.22s ease;
  }

  .hero-primary,
  .hero-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    padding: 0.85rem 1.2rem;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .hero-primary {
    color: var(--color-button-text);
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 88%, white 12%), var(--color-primary));
    box-shadow: 0 18px 34px rgba(var(--shadow-rgb), 0.2);
  }

  .hero-secondary {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
  }

  .hero-stats {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 1.5rem;
  }

  .hero-stats div,
  .support-card,
  .entry-card {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(16px);
  }

  .hero-stats div {
    border-radius: 1.4rem;
    padding: 1rem;
  }

  .hero-stats dt {
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    opacity: 0.56;
  }

  .hero-stats dd {
    margin-top: 0.45rem;
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.45;
  }

  .entry-strip {
    display: grid;
    gap: 0.95rem;
  }

  .entry-strip__head h2,
  .support-card h2 {
    margin-top: 0.45rem;
    font-size: clamp(1.5rem, 4vw, 2.4rem);
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1.05;
  }

  .entry-grid,
  .support-grid {
    display: grid;
    gap: 1rem;
  }

  .entry-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .entry-card {
    display: flex;
    min-height: 14rem;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.9rem;
    border-radius: 1.7rem;
    padding: 1.15rem;
  }

  .entry-card__eyebrow,
  .entry-card__cta,
  .action-list em {
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .entry-card strong {
    display: block;
    font-size: 1.2rem;
    font-weight: 900;
  }

  .entry-card p {
    line-height: 1.65;
    opacity: 0.8;
  }

  .entry-card__cta {
    opacity: 0.76;
  }

  .support-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  }

  .support-card {
    border-radius: 1.7rem;
    padding: 1.15rem;
  }

  .action-list {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.95rem;
  }

  .action-list a {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.25rem;
    padding: 0.95rem 1rem;
    background: rgba(255, 255, 255, 0.04);
  }

  .action-list strong {
    display: block;
    font-size: 0.96rem;
    font-weight: 900;
  }

  .action-list small {
    display: block;
    margin-top: 0.38rem;
    line-height: 1.55;
    opacity: 0.76;
  }

  .action-list em {
    font-style: normal;
    opacity: 0.58;
  }

  .support-card--notes p:last-child {
    margin-top: 0.85rem;
    line-height: 1.72;
    opacity: 0.82;
  }

  .hero-primary:hover,
  .hero-secondary:hover,
  .entry-card:hover,
  .action-list a:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 960px) {
    .entry-grid,
    .support-grid,
    .hero-stats {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .hero-head {
      flex-direction: column;
    }

    .hero-pill {
      width: 100%;
      min-width: 0;
    }

    .hero-actions {
      flex-direction: column;
    }

    .hero-primary,
    .hero-secondary {
      width: 100%;
    }
  }
</style>
