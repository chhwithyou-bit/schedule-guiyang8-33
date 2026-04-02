<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import CommunityWordmark from '../ui/CommunityWordmark.svelte';
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
      <h1 class="sr-only">8community</h1>
      <p class="text-[10px] font-black uppercase tracking-[0.32em] opacity-35">正在发生</p>
      <CommunityWordmark class="mt-3 max-w-[min(56rem,100%)]" />
      <p class="mt-4 max-w-2xl text-sm font-medium leading-7 opacity-70 md:text-base">
        近况、照片、碎碎念都能直接发。入口已经提到上面，抬手就能写，不用再去底下翻。
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70">说近况</span>
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70">挂图片</span>
        <span class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70">找得到</span>
      </div>
    </div>

    <div class="community-action-panel rounded-[32px] p-4">
      {#if $isAuthenticated}
        <button
          type="button"
          on:click={openComposer}
          class="community-action-panel__button group flex w-full items-center gap-4 rounded-[28px] px-4 py-4 text-left transition-transform duration-300 hover:scale-[1.01]"
        >
          <button 
            type="button" 
            on:click|stopPropagation={() => openModal('community-console')} 
            class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[20px] bg-[var(--color-primary)] text-lg font-black text-[var(--color-bg)] shadow-lg hover:scale-105 transition-transform"
            aria-label="管理个人资料"
          >
            {#if $user?.avatar_url}
              <img src={$user.avatar_url} alt={$user.username || 'user'} class="h-full w-full rounded-[20px] object-cover" />
            {:else}
              {$user?.username?.slice(0, 1).toUpperCase() || 'U'}
            {/if}
          </button>

          <div class="min-w-0 flex-1">
            <p class="text-xs font-black uppercase tracking-[0.22em] opacity-40">
              {$user?.username || '你'} 正准备发帖
            </p>
            <p class="mt-1 text-lg font-black tracking-tight">
              今天发生了什么，直接写下来。
            </p>
            <p class="mt-2 text-sm font-medium opacity-60">
              文字和图片都行，发出去之后页面会立刻刷新。
            </p>
          </div>

          <div class="community-action-panel__pill hidden rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] opacity-70 md:block">
            去发帖
          </div>
        </button>
      {:else}
        <div
          class="community-action-panel__button group flex w-full items-center gap-4 rounded-[28px] px-4 py-4 text-left transition-transform duration-300"
        >
          <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[20px] bg-[var(--color-primary)] text-lg font-black text-[var(--color-bg)] shadow-lg">
            ?
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-xs font-black uppercase tracking-[0.22em] opacity-40">
              先登录，再来发一条
            </p>
            <p class="mt-1 text-lg font-black tracking-tight">
              登录之后，就能把近况发到社区里。
            </p>
            <p class="mt-2 text-sm font-medium opacity-60">
              登录后点击下方按钮就能打开发帖面板。
            </p>
          </div>
        </div>
      {/if}

      <div class="mt-4 flex flex-wrap gap-3">
        {#if $isAuthenticated}
          <button
            type="button"
            on:click={openComposer}
            class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105"
          >
            发一条
          </button>
        {:else}
          <button
            type="button"
            on:click={() => openModal('auth')}
            class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105"
          >
            登录
          </button>
          <button
            type="button"
            on:click={() => openModal('auth')}
            class="community-action-panel__ghost rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105"
          >
            注册
          </button>
        {/if}
        <button
          type="button"
          on:click={fetchPosts}
          class="community-action-panel__ghost rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105"
        >
          刷新动态
        </button>
      </div>
    </div>
  </section>

  {#if announcement?.content}
    <section class="community-notice-panel mb-10 rounded-[32px] px-6 py-5">
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

  <div class="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">最新动态</p>
      <p class="mt-2 text-sm font-medium opacity-60">
        {loading ? '正在同步大家刚发的内容…' : `现在一共看得到 ${posts.length} 条动态`}
      </p>
    </div>

    <form on:submit={handleSearch} class="relative w-full md:max-w-xs">
      <input 
        type="text" 
        bind:value={query}
        placeholder="搜帖子内容..."
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
      <div class="text-6xl mb-4">· · ·</div>
      <p class="text-xl font-bold opacity-30 uppercase tracking-widest">这里还没有你想看的内容。</p>
      <button
        type="button"
        on:click={openComposer}
        class="mt-8 rounded-full bg-[var(--color-primary)] px-6 py-3 text-xs font-black uppercase tracking-[0.22em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105"
      >
        {$isAuthenticated ? '那就先发第一条' : '登录后发帖'}
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

<style>
  .community-action-panel,
  .community-notice-panel {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.16), rgba(var(--glow-secondary-rgb), 0.12)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.16)),
      rgba(var(--color-bg-rgb), 0.32);
    box-shadow:
      0 20px 48px rgba(var(--shadow-rgb), 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  .community-action-panel__button {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.08)),
      rgba(255, 255, 255, 0.04);
  }

  .community-action-panel__pill,
  .community-action-panel__ghost {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background: rgba(var(--color-bg-rgb), 0.18);
  }
</style>
