<script lang="ts">
  import { onMount } from 'svelte';
	  import CommunityConsole from '../modals/CommunityConsole.svelte';
	  import CommunityWordmark from '../ui/CommunityWordmark.svelte';
	  import PostCard from './PostCard.svelte';
	  import PostDetail from './PostDetail.svelte';
	  import ProfileView from './ProfileView.svelte';
  import { isAuthenticated, selectedPost, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';
  import { navigateToView } from '../../lib/appRouter';
  import { installCommunityHistory, navigateCommunitySection, openCommunityProfile } from '../../lib/communityNavigation';
  import { formatChinaTime } from '../../lib/chinaTime.mjs';
  import { communityViewState, type CommunitySection } from '../../stores/communityViewState';

  let posts: any[] = [];
  let loadingPosts = true;
  let loadingDiscovery = false;
  let query = '';
  let announcement: { content?: string; updatedAt?: string } | null = null;
  let discoveredUsers: any[] = [];
  let postsRequestToken = 0;
  let discoveryRequestToken = 0;
  let mounted = false;
  let lastLoadedSection: CommunitySection | '' = '';
  let lastAuthState = false;

  const sections: Array<{ id: CommunitySection; label: string; count?: number }> = [
    { id: 'feed', label: '动态' },
    { id: 'discovery', label: '发现' },
    { id: 'square', label: '广场' },
    { id: 'favorites', label: '收藏' },
    { id: 'notifications', label: '提醒' }
  ];

  function commitPosts(nextPosts: any[]) {
    posts = nextPosts;
    if ($selectedPost?.id) {
      const refreshedPost = nextPosts.find((item) => item.id === $selectedPost?.id);
      if (refreshedPost) selectedPost.set({ ...$selectedPost, ...refreshedPost });
    }
  }

  function applyPostPatch(postId: string, patch: Record<string, unknown>) {
    posts = posts.map((item) => item.id === postId ? { ...item, ...patch } : item);
    if ($selectedPost?.id === postId) selectedPost.set({ ...$selectedPost, ...patch });
  }

  function openComposer() {
    openModal($isAuthenticated ? 'comm-post' : 'auth');
  }

  function loadSection(section: CommunitySection) {
    if (section === 'feed' || section === 'favorites') void fetchPosts();
    if (section === 'discovery') {
      void fetchDiscovery();
      void fetchPosts();
    }
  }

  async function fetchPosts(background = false) {
    const requestToken = ++postsRequestToken;
    if (!background) loadingPosts = true;

    if ($communityViewState.section === 'favorites' && !$isAuthenticated) {
      posts = [];
      loadingPosts = false;
      return;
    }

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if ($communityViewState.section === 'favorites') params.set('favorites', '1');
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await communityFetch(`/api/community/posts${suffix}`);
      const data = await res.json();
      // Re-check auth before committing: a favorites response that resolves after
      // logout must not leak the previous account's bookmarks into the UI.
      if ($communityViewState.section === 'favorites' && !$isAuthenticated) {
        if (requestToken === postsRequestToken) commitPosts([]);
        return;
      }
      if (data.ok && requestToken === postsRequestToken) {
        commitPosts(Array.isArray(data.posts) ? data.posts : []);
      }
    } catch (error) {
      if (requestToken === postsRequestToken && !background) commitPosts([]);
      console.error('Failed to fetch posts', error);
    } finally {
      if (requestToken === postsRequestToken) loadingPosts = false;
    }
  }

  async function fetchAnnouncement() {
    try {
      const res = await communityFetch('/api/community/announcement');
      const data = await res.json();
      if (data.ok) announcement = data.announcement;
    } catch (error) {
      console.error('Failed to fetch announcement', error);
    }
  }

  async function fetchDiscovery(background = false) {
    const requestToken = ++discoveryRequestToken;
    if (!background) loadingDiscovery = true;

    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await communityFetch(`/api/community/discovery${suffix}`);
      const data = await res.json();
      if (data.ok && requestToken === discoveryRequestToken) {
        discoveredUsers = Array.isArray(data.users) ? data.users : [];
      }
    } catch (error) {
      if (requestToken === discoveryRequestToken && !background) discoveredUsers = [];
      console.error('Failed to fetch discovery', error);
    } finally {
      if (requestToken === discoveryRequestToken) loadingDiscovery = false;
    }
  }

  function handleSearch(event: Event) {
    event.preventDefault();
    if (query.trim() && $communityViewState.section !== 'discovery') {
      navigateCommunitySection('discovery');
    }
    void fetchPosts();
    void fetchDiscovery();
  }

  function handlePostUpdated(event: Event) {
    const customEvent = event as CustomEvent<{ id?: string; patch?: Record<string, unknown> }>;
    const postId = String(customEvent.detail?.id || '');
    const patch = customEvent.detail?.patch;
    if (postId && patch) applyPostPatch(postId, patch);
  }

  function handlePostDeleted(event: Event) {
    const customEvent = event as CustomEvent<{ id?: string }>;
    const postId = String(customEvent.detail?.id || '');
    if (!postId) return;
    posts = posts.filter((item) => item.id !== postId);
    if ($selectedPost?.id === postId) selectedPost.set(null);
  }

  function handlePostCreated() {
    void fetchPosts();
  }

  function refreshActiveSectionInBackground() {
    if ($communityViewState.section === 'feed' || $communityViewState.section === 'favorites') {
      void fetchPosts(true);
      return;
    }

    if ($communityViewState.section === 'discovery') {
      void fetchDiscovery(true);
      if (query.trim()) void fetchPosts(true);
    }
  }

  $: if (mounted && $communityViewState.section !== lastLoadedSection) {
    lastLoadedSection = $communityViewState.section;
    loadSection($communityViewState.section);
  }

  $: if (mounted && $isAuthenticated !== lastAuthState) {
    lastAuthState = $isAuthenticated;
    postsRequestToken += 1;

    if (!$isAuthenticated && $communityViewState.section === 'favorites') {
      posts = [];
      loadingPosts = false;
    } else if ($communityViewState.section !== 'notifications' && $communityViewState.section !== 'square') {
      loadSection($communityViewState.section);
    }
  }

  let refreshInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    mounted = true;
    lastLoadedSection = $communityViewState.section;
    lastAuthState = $isAuthenticated;
    loadSection($communityViewState.section);
    void fetchAnnouncement();
    window.addEventListener('post-created', handlePostCreated);
    window.addEventListener('community-post-updated', handlePostUpdated as EventListener);
    window.addEventListener('community-post-deleted', handlePostDeleted as EventListener);
    window.addEventListener('community-announcement-updated', fetchAnnouncement);
    const uninstallHistory = installCommunityHistory();

    refreshInterval = setInterval(refreshActiveSectionInBackground, 10000);

    return () => {
      mounted = false;
      clearInterval(refreshInterval);
      window.removeEventListener('post-created', handlePostCreated);
      window.removeEventListener('community-post-updated', handlePostUpdated as EventListener);
      window.removeEventListener('community-post-deleted', handlePostDeleted as EventListener);
      window.removeEventListener('community-announcement-updated', fetchAnnouncement);
      uninstallHistory();
    };
  });
</script>

<div class="community-view" data-motion-role="community-surface">
	  <section class="lede community-hero-shell">
	    <p class="ui-kicker">正在发生</p>
	    <CommunityWordmark class="mt-4" />
	    <h1>把近况放进一个<em>安静</em>的社区里。</h1>
	    <div class="hero-actions">
	      <button type="button" on:click={openComposer} class="ui-button-primary">{$isAuthenticated ? '发一条' : '登录后发帖'}</button>
	      <button type="button" on:click={() => navigateToView('profile')} class="ui-button-ghost" disabled={!$isAuthenticated}>我的资料</button>
	    </div>
	  </section>

  <nav class="sections" aria-label="社区分区">
    {#each sections as section}
      <button
        type="button"
        on:click={() => navigateCommunitySection(section.id)}
        class="community-pill section-tab {$communityViewState.section === section.id ? 'is-active' : ''}"
        aria-pressed={$communityViewState.section === section.id}
      >
        {section.label}
        {#if section.id === 'feed'}<span class="count">{posts.length}</span>{/if}
      </button>
    {/each}
  </nav>

  <div class="layout">
    <div class="main-column">
      <form class="search-row" on:submit={handleSearch}>
        <input class="community-search-input" bind:value={query} placeholder="搜索帖子或用户" />
        <button type="submit" class="ui-button-ghost">搜索</button>
      </form>

      {#if $communityViewState.section === 'feed' || $communityViewState.section === 'favorites'}
        <button type="button" on:click={openComposer} class="composer">
          <span class="composer-avatar">{$isAuthenticated ? '我' : '/'}</span>
	          <span class="ph">{$isAuthenticated ? '今天想说什么，直接写下来。' : '登录后就能发布近况。'}</span>
	          <span class="btn-primary">发一条</span>
	        </button>

        {#if $communityViewState.section === 'favorites' && !$isAuthenticated}
	          <div class="empty-state">登录后才能查看收藏夹。</div>
	        {:else if loadingPosts}
	          <div class="empty-state">帖子正在同步。</div>
	        {:else if posts.length > 0}
	          <div class="feed">
	            {#each posts as post (post.id)}
	              <PostCard {post} />
	            {/each}
	          </div>
	        {:else}
	          <div class="empty-state">这里还没有内容。要不要发第一条？</div>
	        {/if}
      {/if}

      {#if $communityViewState.section === 'discovery'}
        <section class="discovery-block">
          <div class="section-head">
	            <p class="ui-kicker">Discovery</p>
	            <h2>发现社区用户</h2>
	            {#if loadingDiscovery}<span>同步中</span>{/if}
          </div>

          <div class="discovery-list">
            {#if discoveredUsers.length > 0}
              {#each discoveredUsers as profile (profile.id)}
                <button type="button" on:click={() => openCommunityProfile(profile)} class="community-discovery-card">
                  <span class="discovery-avatar">
                    {#if profile.avatar_url}<img src={profile.avatar_url} alt={profile.username} />{:else}{profile.username?.slice(0, 1)?.toUpperCase() || '?'}{/if}
                  </span>
                  <span>
                    <strong>{profile.username}</strong>
	                    <small>{profile.signature || '还没有写签名。'}</small>
                  </span>
                </button>
              {/each}
            {:else}
	              <div class="empty-state">换个关键词试试。</div>
            {/if}
          </div>

          {#if query.trim()}
            <div class="related-posts">
              <h3>相关帖子</h3>
              {#if loadingPosts}
	                <div class="empty-state">帖子正在同步。</div>
              {:else if posts.length > 0}
                {#each posts as post (post.id)}<PostCard {post} />{/each}
              {:else}
	                <div class="empty-state">没有相关帖子。</div>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

      {#if $communityViewState.section === 'notifications'}
        <CommunityConsole embedded={true} defaultTab="notifications" allowedTabs={['notifications']} />
      {/if}

      {#if $communityViewState.section === 'square'}
        <CommunityConsole embedded={true} defaultTab="drive" allowedTabs={['drive']} showDriveTab={true} />
      {/if}
    </div>

    <aside class="aside">
      <section class="announce">
        <p class="label">公告</p>
	        <p>{announcement?.content || '目前没有新的公告。'}</p>
        {#if announcement?.updatedAt}<time>{formatChinaTime(announcement.updatedAt)}</time>{/if}
      </section>

      <section class="aside-links">
	        <button type="button" on:click={() => navigateToView('profile')}>个人主页 /</button>
	        <button type="button" on:click={() => navigateCommunitySection('square')}>广场 /</button>
	        <button type="button" on:click={() => navigateCommunitySection('notifications')}>提醒 /</button>
      </section>
    </aside>
  </div>

  {#if $selectedPost}<PostDetail />{/if}
  {#if $selectedProfile}<ProfileView />{/if}
</div>

<style>
	  .community-view {
	    color: var(--ink);
	  }

	  .lede {
	    max-width: 720px;
	    margin-bottom: var(--s6);
	  }

  .community-hero-shell {
    display: grid;
	    gap: var(--s3);
	  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
  }

  .lede h1 {
	    margin-top: var(--s3);
	    font-family: var(--serif);
	    font-size: clamp(40px, 6vw, 64px);
	    font-weight: 400;
	    letter-spacing: -0.02em;
	    line-height: 1.05;
	  }

	  .lede h1 em {
	    color: var(--ink-soft);
	    font-style: italic;
	  }

	  .sections {
	    display: flex;
	    gap: var(--s4);
	    margin-bottom: var(--s5);
	    border-bottom: 1px solid var(--hairline);
	  }

  .section-tab {
    position: relative;
	    padding: 0 0 var(--s2);
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 500;
	    transition: color 180ms ease;
	  }

	  .section-tab:hover,
	  .section-tab.is-active {
	    color: var(--ink);
	  }

	  .section-tab.is-active::after {
	    content: '';
	    position: absolute;
	    right: 0;
	    bottom: -1px;
	    left: 0;
	    height: 2px;
	    background: var(--clay);
	  }

  .count {
    margin-left: 4px;
	    color: var(--clay);
    font-size: 11px;
    vertical-align: super;
  }

	  .layout {
	    display: grid;
	    grid-template-columns: minmax(0, 1fr) 320px;
	    gap: var(--s6);
	    align-items: start;
	  }

  .search-row {
	    display: flex;
	    gap: var(--s2);
	    margin-bottom: var(--s3);
	  }

  .community-search-input {
	    min-height: 44px;
	    flex: 1;
	    border: 1px solid var(--hairline);
	    border-radius: var(--r-btn);
	    background: var(--surface);
    padding: 0 14px;
    font-family: var(--sans);
    font-size: 14px;
  }

	  .community-search-input:focus {
	    border-color: var(--clay);
	    outline: none;
	  }

  .composer {
    display: flex;
    align-items: center;
	    gap: var(--s3);
	    width: 100%;
	    margin-bottom: var(--s5);
	    border: 1px solid var(--hairline);
	    border-radius: var(--r-card);
	    background: var(--surface);
	    padding: var(--s3);
	    text-align: left;
	    transition: border-color 180ms ease;
	  }

	  .composer:hover {
	    border-color: var(--hairline-strong);
	  }

  .composer-avatar {
    display: grid;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 999px;
	    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-weight: 600;
  }

  .ph {
	    flex: 1;
	    color: var(--ink-soft);
	  }

  .btn-primary {
    border-radius: var(--r-btn);
	    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 500;
    padding: 10px 20px;
  }

	  .feed {
	    display: flex;
	    flex-direction: column;
	  }

	  .empty-state {
	    border: 1px solid var(--hairline);
	    border-radius: var(--r-card);
	    background: var(--surface);
	    color: var(--ink-soft);
	    padding: var(--s4);
	    text-align: center;
	  }

  .aside {
    position: sticky;
	    top: 120px;
	  }

	  .announce {
	    border-left: 2px solid var(--clay);
	    padding-left: var(--s3);
	  }

  .announce .label {
    margin-bottom: var(--s2);
	    color: var(--clay);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .announce p:not(.label) {
    color: var(--ink-soft);
  }

  .announce time {
    display: block;
    margin-top: var(--s2);
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 12px;
  }

  .aside-links {
    display: grid;
    gap: var(--s2);
	    margin-top: var(--s5);
	  }

  .aside-links button {
	    color: var(--ink-soft);
	    font-family: var(--sans);
	    font-size: 14px;
	    text-align: left;
	    transition: color 180ms ease;
	  }

	  .aside-links button:hover {
	    color: var(--ink);
	  }

  .discovery-block {
    display: grid;
    gap: var(--s4);
  }

  .section-head h2,
  .related-posts h3 {
    margin-top: var(--s1);
	    font-family: var(--serif);
	    font-size: clamp(28px, 4vw, 38px);
	    font-weight: 400;
    line-height: 1.1;
  }

  .discovery-list {
    display: grid;
    gap: var(--s2);
  }

  .community-discovery-card {
    display: flex;
    align-items: center;
    gap: var(--s2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
	    background: var(--surface);
    padding: var(--s2);
    text-align: left;
    transition: border-color 180ms ease, transform 180ms ease;
  }

  .community-discovery-card:hover {
    border-color: var(--hairline-strong);
    transform: translateY(-1px);
  }

  .discovery-avatar {
    display: grid;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    place-items: center;
    overflow: hidden;
    border-radius: 999px;
    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-weight: 600;
  }

  .discovery-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .community-discovery-card strong {
    display: block;
    font-family: var(--sans);
    font-weight: 600;
  }

  .community-discovery-card small {
    display: block;
    color: var(--ink-soft);
  }

	  @media (max-width: 900px) {
	    .layout {
	      grid-template-columns: 1fr;
	      gap: var(--s5);
	    }

    .aside {
      position: static;
    }
  }

	  @media (max-width: 640px) {
	    .sections {
	      gap: var(--s3);
	      overflow-x: auto;
	    }

    .composer {
      align-items: flex-start;
      gap: var(--s2);
    }

    .btn-primary {
      display: none;
    }
  }
</style>
