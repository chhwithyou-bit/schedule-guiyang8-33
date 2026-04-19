<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CommunityWordmark from '../ui/CommunityWordmark.svelte';
  import CommunityConsole from '../modals/CommunityConsole.svelte';
  import PostCard from './PostCard.svelte';
  import PostDetail from './PostDetail.svelte';
  import ProfileView from './ProfileView.svelte';
  import { currentView, isAuthenticated, selectedPost, selectedProfile, user } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';
  import { communityViewState, setCommunityViewState, type CommunitySection } from '../../stores/communityViewState';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';

  let posts: any[] = [];
  let loadingPosts = true;
  let loadingDiscovery = false;
  let query = '';
  let announcement: { content?: string; updatedAt?: string } | null = null;
  let discoveredUsers: any[] = [];
  let discoveredGroups: any[] = [];
  let postsRequestToken = 0;
  let discoveryRequestToken = 0;

  const sections: Array<{ id: CommunitySection; label: string; detail: string }> = [
    { id: 'feed', label: '动态', detail: '最新帖子和发帖入口' },
    { id: 'discovery', label: '发现', detail: '搜索用户和群组' },
    { id: 'messages', label: '消息', detail: '私聊和群聊' },
    { id: 'notifications', label: '通知', detail: '互动提醒' }
  ];

  function applyPostPatch(postId: string, patch: Record<string, unknown>) {
    posts = posts.map((item) => item.id === postId ? { ...item, ...patch } : item);

    if ($selectedPost?.id === postId) {
      selectedPost.set({
        ...$selectedPost,
        ...patch
      });
    }
  }

  function openComposer() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    openModal('comm-post');
  }

  function openSection(section: CommunitySection) {
    if (section === 'messages') {
      setCommunityConsoleState({ tab: 'chats', conversationId: '' });
      setCommunityViewState({ section, messageTab: 'chats' });
      return;
    }

    setCommunityViewState({ section });
  }

  async function fetchPosts() {
    const requestToken = ++postsRequestToken;
    loadingPosts = true;

    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await communityFetch(`/api/community/posts${suffix}`);
      const data = await res.json();

      if (data.ok && requestToken === postsRequestToken) {
        posts = Array.isArray(data.posts) ? data.posts : [];
      }
    } catch (error) {
      if (requestToken === postsRequestToken) {
        posts = [];
      }
      console.error('Failed to fetch posts', error);
    } finally {
      if (requestToken === postsRequestToken) {
        loadingPosts = false;
      }
    }
  }

  async function fetchAnnouncement() {
    try {
      const res = await communityFetch('/api/community/announcement');
      const data = await res.json();
      if (data.ok) {
        announcement = data.announcement;
      }
    } catch (error) {
      console.error('Failed to fetch announcement', error);
    }
  }

  async function fetchDiscovery() {
    const requestToken = ++discoveryRequestToken;
    loadingDiscovery = true;

    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await communityFetch(`/api/community/discovery${suffix}`);
      const data = await res.json();

      if (data.ok && requestToken === discoveryRequestToken) {
        discoveredUsers = Array.isArray(data.users) ? data.users : [];
        discoveredGroups = Array.isArray(data.groups) ? data.groups : [];
      }
    } catch (error) {
      if (requestToken === discoveryRequestToken) {
        discoveredUsers = [];
        discoveredGroups = [];
      }
      console.error('Failed to fetch discovery', error);
    } finally {
      if (requestToken === discoveryRequestToken) {
        loadingDiscovery = false;
      }
    }
  }

  function handleSearch(event: Event) {
    event.preventDefault();
    void fetchPosts();
    void fetchDiscovery();
  }

  async function handleJoinGroup(groupId: string) {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    try {
      const res = await communityFetch('/api/community/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: groupId })
      });
      const data = await res.json();
      if (!data.ok) return;

      setCommunityConsoleState({ tab: 'groups', conversationId: groupId });
      setCommunityViewState({ section: 'messages', messageTab: 'groups' });
    } catch (error) {
      console.error('Failed to join group', error);
    }
  }

  function openUserProfile(profile: any) {
    selectedProfile.set({
      id: profile.id || profile.user_id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      role: profile.role,
      signature: profile.signature,
      background_url: profile.background_url
    });
  }

  function openMyProfile() {
    currentView.set('profile');
  }

  function handlePostCreated() {
    void fetchPosts();
  }

  function handlePostUpdated(event: Event) {
    const customEvent = event as CustomEvent<{ id?: string; patch?: Record<string, unknown> }>;
    const postId = String(customEvent.detail?.id || '');
    const patch = customEvent.detail?.patch;
    if (!postId || !patch) return;
    applyPostPatch(postId, patch);
  }

  function handleAnnouncementUpdated() {
    void fetchAnnouncement();
  }

  onMount(() => {
    void fetchPosts();
    void fetchDiscovery();
    void fetchAnnouncement();
    window.addEventListener('post-created', handlePostCreated);
    window.addEventListener('community-post-updated', handlePostUpdated as EventListener);
    window.addEventListener('community-announcement-updated', handleAnnouncementUpdated);
  });

  onDestroy(() => {
    window.removeEventListener('post-created', handlePostCreated);
    window.removeEventListener('community-post-updated', handlePostUpdated as EventListener);
    window.removeEventListener('community-announcement-updated', handleAnnouncementUpdated);
  });
</script>

<div class="community-view space-y-8">
  <section class="community-hero-shell rounded-[36px] p-5 xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] xl:gap-6 xl:p-6">
    <div class="community-hero-copy">
      <p class="text-[10px] font-black uppercase tracking-[0.32em] opacity-35">正在发生</p>
      <CommunityWordmark class="mt-3 max-w-[min(56rem,100%)]" />
      <p class="mt-4 max-w-2xl text-sm font-medium leading-7 opacity-70 md:text-base">
        社区现在只保留内容、发现、消息和通知四个子区。发帖、聊天、群聊和个人资料编辑都还在，但入口比旧站收得更清楚。
      </p>

      <div class="mt-5 flex flex-wrap gap-3">
        <button type="button" on:click={openComposer} class="community-primary rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)]">
          {$isAuthenticated ? '发一条' : '登录后发帖'}
        </button>
        <button
          type="button"
          on:click={openMyProfile}
          class="community-secondary rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em]"
          disabled={!$isAuthenticated}
        >
          我的资料
        </button>
      </div>
    </div>

    <div class="community-summary-panel mt-6 rounded-[32px] p-5 xl:mt-0">
      <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">社区分区</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        {#each sections as section}
          <button
            type="button"
            on:click={() => openSection(section.id)}
            class="community-section-card {$communityViewState.section === section.id ? 'is-active' : ''} rounded-[24px] p-4 text-left"
          >
            <span class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{section.label}</span>
            <strong class="mt-2 block text-lg font-black tracking-tight">{section.detail}</strong>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section class="community-shell rounded-[32px] p-4 md:p-5">
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">社区导航</p>
        <h2 class="mt-2 text-2xl font-black tracking-tight">动态、发现、消息、通知</h2>
      </div>

      <form on:submit={handleSearch} class="relative w-full md:max-w-sm">
        <input
          type="text"
          bind:value={query}
          placeholder="搜索帖子、用户或群组..."
          class="community-search-input w-full rounded-2xl px-6 py-4 font-medium text-[var(--color-text,#fff4ed)] outline-none transition-all placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)]"
        />
        <button type="submit" class="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 transition-opacity hover:opacity-100">
          搜索
        </button>
      </form>
    </div>

    <div class="mt-5 flex flex-wrap gap-3">
      {#each sections as section}
        <button
          type="button"
          on:click={() => openSection(section.id)}
          class="community-pill {$communityViewState.section === section.id ? 'is-active' : ''} rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em]"
        >
          {section.label}
        </button>
      {/each}
    </div>
  </section>

  {#if $communityViewState.section === 'feed'}
    {#if announcement?.content}
      <section class="community-shell rounded-[32px] px-6 py-5 md:px-7 md:py-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">站内公告</p>
            <p class="mt-2 max-w-3xl text-sm font-medium leading-7 opacity-80 md:text-base">
              {announcement.content}
            </p>
          </div>
          {#if announcement.updatedAt}
            <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-30">
              {new Date(announcement.updatedAt).toLocaleString('zh-CN')}
            </p>
          {/if}
        </div>
      </section>
    {/if}

    <section class="community-shell rounded-[32px] p-5">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">最新动态</p>
          <p class="mt-2 text-sm font-medium opacity-60">
            {loadingPosts ? '正在同步最新帖子...' : `当前可见 ${posts.length} 条动态`}
          </p>
        </div>
        <button type="button" on:click={fetchPosts} class="community-secondary rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em]">
          刷新
        </button>
      </div>

      {#if loadingPosts}
        <div class="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {#each Array(6) as _}
            <div class="h-80 animate-pulse rounded-[32px] border border-white/10 bg-white/5"></div>
          {/each}
        </div>
      {:else if posts.length > 0}
        <div class="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {#each posts as post (post.id)}
            <PostCard {post} />
          {/each}
        </div>
      {:else}
        <div class="mt-6 rounded-[28px] border border-white/10 bg-white/5 px-5 py-10 text-center text-sm font-medium opacity-70">
          这里还没有你想看的内容。要不要先发第一条？
        </div>
      {/if}
    </section>
  {/if}

  {#if $communityViewState.section === 'discovery'}
    <section class="community-shell rounded-[32px] p-5 md:p-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">发现</p>
          <h2 class="mt-2 text-2xl font-black tracking-tight">搜索用户和群组</h2>
        </div>
        {#if loadingDiscovery}
          <span class="text-xs font-black uppercase tracking-[0.22em] opacity-35">同步中</span>
        {/if}
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-2">
        <div class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-xl font-black tracking-tight">用户</h3>
            <span class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{discoveredUsers.length} 位</span>
          </div>

          {#if discoveredUsers.length > 0}
            <div class="grid gap-4">
              {#each discoveredUsers as profile (profile.id)}
                <button type="button" on:click={() => openUserProfile(profile)} class="community-discovery-card rounded-[28px] p-4 text-left">
                  <div class="flex items-center gap-4">
                    <div class="h-14 w-14 overflow-hidden rounded-[20px] bg-white/10">
                      {#if profile.avatar_url}
                        <img src={profile.avatar_url} alt={profile.username} class="h-full w-full object-cover" />
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-lg font-black tracking-tight">{profile.username}</p>
                      <p class="mt-1 text-sm font-medium opacity-65">{profile.signature || '这个人还没有写签名。'}</p>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <div class="rounded-[28px] border border-white/10 bg-white/5 px-5 py-8 text-sm font-medium opacity-70">
              这里还没有搜到用户，换个关键词试试。
            </div>
          {/if}
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-xl font-black tracking-tight">群组</h3>
            <span class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{discoveredGroups.length} 个</span>
          </div>

          {#if discoveredGroups.length > 0}
            <div class="grid gap-4">
              {#each discoveredGroups as group (group.id)}
                <div class="community-discovery-card rounded-[28px] p-4">
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-lg font-black tracking-tight">{group.title}</p>
                      <p class="mt-1 text-sm font-medium opacity-65">{group.description || '这个群组还没有描述。'}</p>
                      <p class="mt-3 text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{group.member_count || 0} 位成员</p>
                    </div>
                    <button type="button" on:click={() => handleJoinGroup(group.id)} class="community-secondary rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em]">
                      {group.joined ? '打开群聊' : '加入并聊天'}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="rounded-[28px] border border-white/10 bg-white/5 px-5 py-8 text-sm font-medium opacity-70">
              这里还没有搜到群组，换个关键词试试。
            </div>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  {#if $communityViewState.section === 'messages'}
    <section class="community-shell rounded-[32px] p-3 md:p-4">
      <CommunityConsole embedded={true} defaultTab={$communityViewState.messageTab} allowedTabs={['chats', 'groups']} />
    </section>
  {/if}

  {#if $communityViewState.section === 'notifications'}
    <section class="community-shell rounded-[32px] p-3 md:p-4">
      <CommunityConsole embedded={true} defaultTab="notifications" allowedTabs={['notifications']} />
    </section>
  {/if}

  {#if $selectedPost}
    <PostDetail />
  {/if}

  {#if $selectedProfile}
    <ProfileView />
  {/if}
</div>

<style>
  .community-hero-shell,
  .community-shell,
  .community-summary-panel,
  .community-discovery-card {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.14) 0% 42%, rgba(var(--glow-secondary-rgb), 0.1) 42% 100%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.16)),
      rgba(var(--color-bg-rgb), 0.16);
    box-shadow:
      0 20px 48px rgba(var(--shadow-rgb), 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(18px) saturate(1.08);
  }

  .community-primary,
  .community-secondary,
  .community-pill,
  .community-section-card {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.14);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }

  .community-primary {
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 86%, white 14%), var(--color-primary));
    box-shadow:
      0 16px 30px rgba(var(--shadow-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
  }

  .community-search-input {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.14);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .community-pill.is-active,
  .community-section-card.is-active {
    border-color: rgba(var(--glow-primary-rgb), 0.26);
    background:
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.2), rgba(var(--glow-secondary-rgb), 0.12)),
      rgba(var(--color-bg-rgb), 0.24);
    box-shadow:
      0 14px 28px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .community-primary:hover,
  .community-secondary:hover,
  .community-pill:hover,
  .community-section-card:hover,
  .community-discovery-card:hover {
    transform: translateY(-1px);
  }
</style>
