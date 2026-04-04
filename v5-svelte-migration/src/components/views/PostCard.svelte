<script lang="ts">
  import { selectedPost, isAuthenticated, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';

  export let post: any;
  let isLiking = false;

  function safeJsonArray(json: string) {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  const media = safeJsonArray(post.media_json).filter(m => m && m.url);
  const dateStr = new Date(post.created_at).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  $: liked = !!post.viewer_liked;

  import { user } from '../../stores/appState';
  import { get } from 'svelte/store';
  
  function handleProfileClick(e: MouseEvent) {
    e.stopPropagation();
    const currentUser = get(user);
    if (currentUser && currentUser.id === post.user_id) {
      openModal('community-console');
      return;
    }
    selectedProfile.set({
      id: post.user_id,
      username: post.username,
      avatar_url: post.avatar_url,
      role: post.role,
      signature: post.signature,
      background_url: post.background_url
    });
  }

  function openPostDetail(mode: 'default' | 'comments' | 'report' = 'default') {
    selectedPost.set({
      ...post,
      __focusComments: mode === 'comments',
      __openReportComposer: mode === 'report'
    });
  }

  function handlePostClick() {
    openPostDetail();
  }

  function handleCommentClick(e: MouseEvent) {
    e.stopPropagation();
    openPostDetail('comments');
  }

  function handleReportClick(e: MouseEvent) {
    e.stopPropagation();
    openPostDetail('report');
  }

  async function toggleLike(e: MouseEvent) {
    e.stopPropagation();
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    if (isLiking) return;

    isLiking = true;
    try {
      const res = await communityFetch('/api/community/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id })
      });
      const data = await res.json();
      if (data.ok) {
        post.viewer_liked = data.action === 'liked';
        post.like_count = (post.like_count || 0) + (data.action === 'liked' ? 1 : -1);
      }
    } catch (e) {
      console.error('Like failed', e);
    } finally {
      isLiking = false;
    }
  }
</script>

<article class="post-glass-card group relative overflow-hidden rounded-[32px] p-6 transition-all duration-500 hover:-translate-y-1">
  <div aria-hidden="true" class="post-glass-card__overlay pointer-events-none absolute inset-0 opacity-90"></div>
  <div aria-hidden="true" class="post-glass-card__shine pointer-events-none absolute inset-x-6 top-0 h-px opacity-70"></div>

  <div class="relative z-[1]">
    <div class="mb-4 flex items-center gap-3">
      <button on:click={handleProfileClick} aria-label={`打开 ${post.username || '用户'} 的主页`} class="post-glass-avatar h-10 w-10 flex-shrink-0 overflow-hidden rounded-full">
        {#if post.avatar_url}
          <img src={post.avatar_url} alt={post.username} class="h-full w-full object-cover" />
        {:else}
          <div class="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--color-primary)]">
            {post.username?.slice(0, 1).toUpperCase() || '?'}
          </div>
        {/if}
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="truncate text-sm font-bold tracking-tight text-neutral-900 dark:text-white">{post.username || 'Anonymous'}</span>
          {#if post.role === 'admin'}
            <span class="rounded-md border border-white/10 bg-[var(--color-primary)]/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-[var(--color-primary)]/20">管理员</span>
          {/if}
        </div>
        <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-700/55 dark:text-white/35">{dateStr}</p>
      </div>
    </div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div on:click={handlePostClick} class="mb-4 cursor-pointer">
      <p class="line-clamp-6 whitespace-pre-wrap text-base font-medium leading-relaxed text-neutral-800 dark:text-neutral-100/92">
        {post.content}
      </p>
    </div>

    {#if media.length > 0}
      <div class="post-glass-media mb-6 grid gap-2 overflow-hidden rounded-[24px] p-2 {media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}">
        {#each media.slice(0, 4) as item, i}
          <div class="post-glass-media__item relative aspect-square overflow-hidden rounded-[18px]">
            <img src={item.url} alt="Post media" class="h-full w-full object-cover" loading="lazy" />
            {#if i === 3 && media.length > 4}
              <div class="absolute inset-0 flex items-center justify-center bg-black/38 text-xl font-bold text-white backdrop-blur-sm">
                +{media.length - 4}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="post-glass-footer flex items-center justify-between pt-4">
      <div class="flex items-center gap-4">
        <button 
          on:click={toggleLike}
          aria-label="点赞这条内容"
          class="flex items-center gap-1.5 transition-all {liked ? 'scale-110 text-red-500' : 'opacity-55 hover:opacity-100'}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          <span class="text-xs font-black">{post.like_count || 0}</span>
        </button>

        <button on:click={handleCommentClick} aria-label="查看评论" class="flex items-center gap-1.5 opacity-55 transition-opacity hover:opacity-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          <span class="text-xs font-black">{post.comment_count || 0}</span>
        </button>
      </div>

      <button on:click={handleReportClick} aria-label="举报这条内容" class="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] opacity-40 transition-opacity hover:opacity-100">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16"></path><path d="M4 5h11l-1.5 3L16 11H4"></path></svg>
        <span>举报</span>
      </button>
    </div>
  </div>
</article>

<style>
  .post-glass-card {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.16);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.18) 0% 45%, rgba(var(--glow-secondary-rgb), 0.14) 45% 100%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.18)),
      rgba(var(--color-bg-rgb), 0.22);
    box-shadow:
      0 22px 60px rgba(var(--shadow-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(28px) saturate(1.2);
  }

  .post-glass-card:hover {
    box-shadow:
      0 28px 72px rgba(var(--shadow-rgb), 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -1px 0 rgba(0, 0, 0, 0.1);
  }

  .post-glass-card__overlay {
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.32), transparent 38%),
      radial-gradient(circle at 82% 18%, rgba(var(--glow-secondary-rgb), 0.22), transparent 30%),
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.08) 0% 50%, rgba(var(--glow-secondary-rgb), 0.06) 50% 100%);
  }

  .post-glass-card__shine {
    background: linear-gradient(90deg, rgba(var(--glow-primary-rgb), 0.06), rgba(255, 255, 255, 0.58), rgba(var(--glow-secondary-rgb), 0.1));
  }

  .post-glass-avatar {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.24);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.28) 0% 50%, rgba(var(--glow-secondary-rgb), 0.16) 50% 100%),
      rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
    backdrop-filter: blur(18px);
  }

  .post-glass-media {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(180deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.06)),
      rgba(var(--color-bg-rgb), 0.18);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(22px);
  }

  .post-glass-media__item {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.14);
  }

  .post-glass-footer {
    border-top: 1px solid rgba(var(--glow-primary-rgb), 0.14);
  }
</style>
