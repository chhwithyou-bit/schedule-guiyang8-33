<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import PostCard from './PostCard.svelte';
  import PostDetail from './PostDetail.svelte';
  import ProfileView from './ProfileView.svelte';
  import { isAuthenticated, selectedPost, selectedProfile, user } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';

  let posts: any[] = [];
  let loading = true;
  let query = '';
  let announcement: { content?: string; updatedAt?: string } | null = null;

  onMount(() => {
    fetchPosts();
    fetchAnnouncement();
    window.addEventListener('post-created', fetchPosts);
    return () => {
      window.removeEventListener('post-created', fetchPosts);
    };
  });

  async function fetchPosts() {
    loading = true;
    try {
      let url = '/api/community/posts?';
      if (query) url += `q=${encodeURIComponent(query)}&`;
      
      const res = await communityFetch(url);
      const data = await res.json();
      if (data.ok) {
        posts = data.posts;
      }
    } catch (e) {
      console.error('Failed to fetch posts', e);
    } finally {
      loading = false;
    }
  }

  function handleSearch(e: Event) {
    e.preventDefault();
    fetchPosts();
  }

  async function fetchAnnouncement() {
    try {
      const res = await communityFetch('/api/community/announcement');
      const data = await res.json();
      if (data.ok) {
        announcement = data.announcement;
      }
    } catch (e) {
      console.error('Failed to fetch announcement', e);
    }
  }

  function openComposer() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    openModal('comm-post');
  }
</script>

<div class="community-view">
  <section class="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)] xl:items-end">
    <div>
      <AnimatedHeading text="Community Hub" className="text-[10vw] md:text-[8vw]" />
      <p class="mt-4 max-w-2xl text-sm font-medium leading-7 opacity-70 md:text-base">
        把近况、照片、进度和碎片想法直接发出来。社区页现在提供固定的发帖入口，不再藏在底部折叠菜单里。
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70">Live Feed</span>
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70">Images Ready</span>
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70">Searchable</span>
      </div>
    </div>

    <div class="rounded-[32px] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
      <button
        type="button"
        on:click={openComposer}
        class="group flex w-full items-center gap-4 rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4 text-left transition-transform duration-300 hover:scale-[1.01]"
      >
        <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[20px] bg-[var(--color-primary)] text-lg font-black text-[var(--color-bg)] shadow-lg">
          {#if $user?.avatar_url}
            <img src={$user.avatar_url} alt={$user.username || 'user'} class="h-full w-full rounded-[20px] object-cover" />
          {:else if $isAuthenticated}
            {$user?.username?.slice(0, 1).toUpperCase() || 'U'}
          {:else}
            +
          {/if}
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-xs font-black uppercase tracking-[0.22em] opacity-40">
            {$isAuthenticated ? `Posting as ${$user?.username || 'member'}` : 'Community Composer'}
          </p>
          <p class="mt-1 text-lg font-black tracking-tight">
            {$isAuthenticated ? '写一条新帖子，或者顺手发几张图。' : '先登录，再把近况发到社区里。'}
          </p>
          <p class="mt-2 text-sm font-medium opacity-60">
            {$isAuthenticated ? '支持文字和图片，发布后会立即刷新帖子流。' : '登录后可直接打开发帖面板。'}
          </p>
        </div>

        <div class="hidden rounded-full border border-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70 md:block">
          {$isAuthenticated ? 'Open Composer' : 'Login First'}
        </div>
      </button>

      <div class="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          on:click={openComposer}
          class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105"
        >
          {$isAuthenticated ? 'Write Post' : 'Login To Post'}
        </button>
        <button
          type="button"
          on:click={fetchPosts}
          class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105"
        >
          Refresh Feed
        </button>
      </div>
    </div>
  </section>

  {#if announcement?.content}
    <section class="mb-10 rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-6 py-5 shadow-2xl backdrop-blur-xl">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">Community Broadcast</p>
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

  <div class="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">Story Stream</p>
      <p class="mt-2 text-sm font-medium opacity-60">
        {loading ? '同步帖子流...' : `当前加载 ${posts.length} 条帖子`}
      </p>
    </div>

    <form on:submit={handleSearch} class="relative w-full md:max-w-xs">
      <input 
        type="text" 
        bind:value={query}
        placeholder="Search stories..."
        class="w-full px-6 py-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-medium"
      />
      <button type="submit" class="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-100 transition-opacity">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </button>
    </form>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each Array(6) as _}
        <div class="h-80 rounded-[32px] bg-neutral-100 dark:bg-neutral-900 animate-pulse"></div>
      {/each}
    </div>
  {:else if posts.length > 0}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each posts as post (post.id)}
        <div in:fly={{ y: 20, duration: 500 }}>
          <PostCard {post} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="py-32 text-center" in:fade>
      <div class="text-6xl mb-4">empty_state</div>
      <p class="text-xl font-bold opacity-30 uppercase tracking-widest">No stories found here.</p>
      <button
        type="button"
        on:click={openComposer}
        class="mt-8 rounded-full bg-[var(--color-primary)] px-6 py-3 text-xs font-black uppercase tracking-[0.22em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105"
      >
        {$isAuthenticated ? 'Post The First Story' : 'Login To Post'}
      </button>
    </div>
  {/if}

  {#if $selectedPost}
    <PostDetail />
  {/if}

  {#if $selectedProfile}
    <ProfileView />
  {/if}
</div>
