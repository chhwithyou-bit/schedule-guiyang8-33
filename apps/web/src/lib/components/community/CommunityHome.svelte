<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import AuthCard from '$lib/components/auth/AuthCard.svelte';
  import CommunityComposerModal from '$lib/components/community/CommunityComposerModal.svelte';
  import {
    communityFetch,
    readStoredCommunitySession,
    type CommunitySession
  } from '$lib/api/communityAuth';
  import { postHref, profileHref } from '$lib/state/communityRouteState';

  type InlineComment = {
    id: string;
    content: string;
    username: string;
  };

  type FeedPost = {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string | null;
    signature?: string | null;
    content: string;
    created_at: string;
    like_count?: number;
    comment_count?: number;
    repost_count?: number;
    inline_comments?: InlineComment[];
  };

  type Announcement = {
    content?: string;
    updatedAt?: string | null;
  };

  export let entryLine = '';

  const routeButtons = [
    { label: '社区', href: '/community' },
    { label: '消息台', href: '/console' },
    { label: '课表', href: '/schedule' },
    { label: '节点', href: '/nodes' }
  ];

  let session: CommunitySession | null = null;
  let posts: FeedPost[] = [];
  let announcement: Announcement | null = null;
  let loadingPosts = false;
  let loadingAnnouncement = false;
  let error = '';
  let query = '';
  let composerOpen = false;
  let authPrompt = '';
  let composeTriggerRef: HTMLButtonElement | null = null;

  onMount(() => {
    syncSession();
    void Promise.all([loadPosts(), loadAnnouncement()]);
  });

  function syncSession() {
    session = readStoredCommunitySession();
  }

  function formatDate(value: string) {
    if (!value) return '';
    return new Date(value).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function loadPosts(nextQuery = query) {
    loadingPosts = true;
    error = '';

    try {
      const trimmedQuery = nextQuery.trim();
      const qs = trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : '';
      const response = await communityFetch(`/api/community/posts${qs}`);
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data?.ok) {
        error = data?.msg || '社区动态没加载出来。';
        posts = [];
        return;
      }

      posts = Array.isArray(data.posts) ? data.posts : [];
    } catch (postError) {
      error = postError instanceof Error ? postError.message : '社区动态没加载出来。';
      posts = [];
    } finally {
      loadingPosts = false;
    }
  }

  async function loadAnnouncement() {
    loadingAnnouncement = true;

    try {
      const response = await fetch('/api/community/announcement');
      const data = await response.json().catch(() => ({ ok: false }));
      announcement = data?.ok ? data.announcement || null : null;
    } catch {
      announcement = null;
    } finally {
      loadingAnnouncement = false;
    }
  }

  async function handleSearch() {
    await loadPosts(query);
  }

  async function jumpTo(href: string) {
    await goto(href);
  }

  function openComposer() {
    syncSession();
    if (!session) {
      authPrompt = '登录后就能发帖、评论、继续聊天。';
      return;
    }

    composerOpen = true;
  }

  function closeComposer() {
    composerOpen = false;
    queueMicrotask(() => composeTriggerRef?.focus());
  }

  async function handleComposerCreated() {
    closeComposer();
    await loadPosts();
  }

  async function handleAuthSuccess() {
    syncSession();
    authPrompt = '';
    await Promise.all([loadPosts(), loadAnnouncement()]);
  }
</script>

<section class="community-view">
  <section class="route-shell community-hero" aria-labelledby="community-title">
    <div class="community-hero__copy">
      <p class="route-kicker">8community</p>
      <h1 id="community-title">社区</h1>
      <p>这里保留社区作为默认首页入口，现在直接承接动态、公告、发帖、帖子详情和个人主页。</p>
      {#if entryLine}
        <p class="community-entryline">{entryLine}</p>
      {/if}
    </div>

    <div class="community-hero__controls">
      <button bind:this={composeTriggerRef} type="button" class="community-primary" on:click={openComposer}>发一条</button>
      <a href="/console" class="community-secondary">打开消息台</a>
      <a href="/community/notifications" class="community-secondary">互动提醒</a>
    </div>
  </section>

  <nav class="community-route-switch" aria-label="社区快捷切换">
    {#each routeButtons as item}
      <button type="button" on:click={() => jumpTo(item.href)}>{item.label}</button>
    {/each}
  </nav>

  {#if announcement?.content || loadingAnnouncement}
    <section class="route-shell community-announcement" aria-label="社区公告">
      <div>
        <p class="route-kicker">Broadcast</p>
        <h2>公告</h2>
      </div>

      {#if loadingAnnouncement}
        <p>正在同步公告…</p>
      {:else if announcement?.content}
        <div class="community-announcement__content">
          <strong>{announcement.content}</strong>
          {#if announcement.updatedAt}
            <small>{formatDate(announcement.updatedAt)}</small>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  {#if !session}
    <section class="community-auth-grid">
      <div class="route-shell community-auth-copy">
        <p class="route-kicker">Guest mode</p>
        <h2>现在就能看动态，登录后就能开始发。</h2>
        <p>{authPrompt || '社区首页已经变成真实页面，访客能浏览，登录后立刻就能发帖、点赞和继续互动。'}</p>
      </div>

      <AuthCard on:success={handleAuthSuccess} />
    </section>
  {/if}

  <section class="route-shell community-feed">
    <div class="community-feed__head">
      <div>
        <p class="route-kicker">Live feed</p>
        <h2>最新动态</h2>
      </div>

      <form
        class="community-feed__search"
        on:submit|preventDefault={handleSearch}
      >
        <input bind:value={query} type="search" placeholder="搜帖子内容..." />
        <button type="submit">搜索</button>
        <button type="button" on:click={() => loadPosts()}>刷新</button>
      </form>
    </div>

    {#if error}
      <p class="community-feedback community-feedback--error">{error}</p>
    {/if}

    <div class="community-feed__list" aria-busy={loadingPosts}>
      {#if loadingPosts}
        <div class="community-feedback">正在同步社区动态…</div>
      {:else if posts.length === 0}
        <div class="community-feedback">这里暂时还没有动态，发一条把它点亮。</div>
      {:else}
        {#each posts as post (post.id)}
          <article class="community-card">
            <div class="community-card__meta">
              <div>
                <a href={profileHref(post.user_id)} class="community-card__author">{post.username}</a>
                {#if post.signature}
                  <p class="community-card__signature">{post.signature}</p>
                {/if}
              </div>
              <small>{formatDate(post.created_at)}</small>
            </div>

            <a href={postHref(post.id)} class="community-card__content">
              {post.content}
            </a>

            <div class="community-card__footer">
              <span>{post.like_count || 0} 赞</span>
              <span>{post.comment_count || 0} 评论</span>
              <span>{post.repost_count || 0} 转发</span>
              <a href={postHref(post.id)}>查看详情</a>
            </div>

            {#if Array.isArray(post.inline_comments) && post.inline_comments.length > 0}
              <div class="community-card__comments">
                {#each post.inline_comments as comment (comment.id)}
                  <p><strong>{comment.username}</strong>：{comment.content}</p>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  </section>
</section>

<CommunityComposerModal open={composerOpen} on:close={closeComposer} on:created={handleComposerCreated} />

<style>
  .community-view {
    display: grid;
    gap: 1.25rem;
  }

  .community-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.25rem;
    flex-wrap: wrap;
    background:
      radial-gradient(circle at top right, rgba(var(--glow-primary-rgb, 249 115 22), 0.18), transparent 30%),
      rgba(8, 15, 26, 0.5);
  }

  .community-hero__copy p:last-child {
    max-width: 48rem;
  }

  .community-entryline {
    margin-top: 0.8rem;
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.62;
  }

  .community-hero__controls,
  .community-feed__search {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .community-primary,
  .community-secondary,
  .community-route-switch button,
  .community-feed__search button {
    border: 0;
    border-radius: 999px;
    padding: 0.85rem 1.2rem;
    font-weight: 900;
    cursor: pointer;
  }

  .community-primary {
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
  }

  .community-secondary,
  .community-route-switch button,
  .community-feed__search button {
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
  }

  .community-route-switch {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .community-announcement {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .community-announcement__content {
    display: grid;
    gap: 0.4rem;
    justify-items: end;
    text-align: right;
  }

  .community-announcement__content strong {
    font-size: 1.05rem;
  }

  .community-announcement__content small {
    opacity: 0.62;
  }

  .community-auth-grid {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 34rem);
  }

  .community-feed__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .community-feed__head h2 {
    margin: 0.75rem 0 0;
    font-size: clamp(1.7rem, 4vw, 2.5rem);
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .community-feed__search input {
    min-width: min(22rem, 60vw);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 0.85rem 1rem;
  }

  .community-feed__list {
    margin-top: 1.25rem;
    display: grid;
    gap: 1rem;
  }

  .community-feedback {
    margin-top: 1rem;
    border-radius: 1.2rem;
    background: rgba(255, 255, 255, 0.06);
    padding: 1rem 1.1rem;
  }

  .community-feedback--error {
    background: rgba(220, 38, 38, 0.16);
    color: #fecaca;
  }

  .community-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.7rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
      rgba(8, 15, 26, 0.48);
    padding: 1.2rem;
    display: grid;
    gap: 0.9rem;
  }

  .community-card__meta,
  .community-card__footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .community-card__author {
    font-size: 1rem;
    font-weight: 900;
  }

  .community-card__signature {
    margin: 0.35rem 0 0;
    opacity: 0.62;
  }

  .community-card__meta small {
    opacity: 0.62;
  }

  .community-card__content {
    line-height: 1.75;
    white-space: pre-wrap;
  }

  .community-card__footer {
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .community-card__footer a {
    opacity: 1;
    text-decoration: underline;
    text-underline-offset: 0.2rem;
  }

  .community-card__comments {
    display: grid;
    gap: 0.45rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.85rem;
  }

  .community-card__comments p {
    margin: 0;
    opacity: 0.78;
  }

  @media (max-width: 900px) {
    .community-auth-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .community-hero,
    .community-announcement,
    .community-feed__head,
    .community-card__meta,
    .community-card__footer {
      flex-direction: column;
    }

    .community-feed__search input {
      min-width: 100%;
    }

    .community-hero__controls > *,
    .community-feed__search > * {
      width: 100%;
      text-align: center;
    }
  }
</style>
