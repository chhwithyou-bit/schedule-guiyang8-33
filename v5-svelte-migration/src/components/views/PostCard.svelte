<script lang="ts">
  import { currentView, selectedPost, isAuthenticated, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';
  import ReliableImage from '../ui/ReliableImage.svelte';

  export let post: any;
  let isLiking = false;

  function emitPostUpdated(patch: Record<string, unknown>) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('community-post-updated', {
      detail: {
        id: post.id,
        patch
      }
    }));
  }

  function safeJsonArray(json: string) {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  $: media = safeJsonArray(post.media_json).filter(m => m && m.url);
  $: dateStr = new Date(post.created_at).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  import { user } from '../../stores/appState';
  import { get } from 'svelte/store';
  
  function handleProfileClick(e: MouseEvent) {
    e.stopPropagation();
    selectedPost.set(null);
    const currentUser = get(user);
    if (currentUser && currentUser.id === post.user_id) {
      setCommunityConsoleState({ tab: 'account', conversationId: '' });
      currentView.set('console');
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
        const nextLiked = data.action === 'liked';
        const nextLikeCount = Math.max(0, (post.like_count || 0) + (nextLiked ? 1 : -1));
        post.viewer_liked = nextLiked;
        post.like_count = nextLikeCount;
        emitPostUpdated({
          viewer_liked: nextLiked,
          like_count: nextLikeCount
        });
      }
    } catch (e) {
      console.error('Like failed', e);
    } finally {
      isLiking = false;
    }
  }
</script>

<article class="post-glass-card group relative overflow-hidden rounded-[32px] p-5 transition-all duration-500 sm:p-6 hover:-translate-y-0.5">
  <div aria-hidden="true" class="post-glass-card__overlay pointer-events-none absolute inset-0 opacity-90"></div>
  <div aria-hidden="true" class="post-glass-card__shine pointer-events-none absolute inset-x-5 top-0 h-px opacity-65 sm:inset-x-6"></div>

  <div class="relative z-[1] space-y-5">
    <div class="flex items-center gap-3.5">
      <button on:click={handleProfileClick} aria-label={`打开 ${post.username || '用户'} 的主页`} class="post-glass-avatar h-11 w-11 flex-shrink-0 overflow-hidden rounded-[18px] transition-transform duration-300 group-hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--glow-primary-rgb),0.32)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(var(--color-bg-rgb),0.72)]">
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
            <span class="rounded-full border border-white/10 bg-[var(--color-primary)]/88 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-[var(--color-primary)]/18">管理员</span>
          {/if}
        </div>
        <p class="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-700/55 dark:text-white/35">{dateStr}</p>
      </div>
    </div>

    <button
      type="button"
      on:click={handlePostClick}
      aria-label="打开动态详情"
      class="post-glass-content w-full cursor-pointer rounded-[24px] px-1 py-0.5 text-left transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--glow-primary-rgb),0.24)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(var(--color-bg-rgb),0.72)]"
    >
      <p class="line-clamp-6 whitespace-pre-wrap text-base font-medium leading-relaxed text-neutral-800 dark:text-neutral-100/92">
        {post.content}
      </p>
    </button>

    {#if media.length > 0}
      <div class="post-glass-media grid gap-2.5 overflow-hidden rounded-[26px] p-2.5 {media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}">
        {#each media.slice(0, 4) as item, i}
          <div class="post-glass-media__item relative aspect-square overflow-hidden rounded-[20px]">
            <ReliableImage
              src={item.url}
              alt="Post media"
              imgClass="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
              retries={2}
              retryDelay={500}
              loading="lazy"
            />
            {#if i === 3 && media.length > 4}
              <div class="absolute inset-0 flex items-center justify-center bg-black/38 text-xl font-bold text-white backdrop-blur-sm">
                +{media.length - 4}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="post-glass-footer flex items-center justify-between gap-3 pt-3">
      <div class="flex items-center gap-2.5">
        <button
          on:click={toggleLike}
          aria-label="点赞这条内容"
          class="post-glass-action-btn {post.viewer_liked ? 'is-active text-red-500' : ''}"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={post.viewer_liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          <span class="text-xs font-black">{post.like_count || 0}</span>
        </button>

        <button on:click={handleCommentClick} aria-label="查看评论" class="post-glass-action-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          <span class="text-xs font-black">{post.comment_count || 0}</span>
        </button>
      </div>

      <button on:click={handleReportClick} aria-label="举报这条内容" class="post-glass-action-btn post-glass-action-btn--ghost text-[11px] uppercase tracking-[0.16em]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16"></path><path d="M4 5h11l-1.5 3L16 11H4"></path></svg>
        <span>举报</span>
      </button>
    </div>
  </div>
</article>

<style>
  .post-glass-card {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.14) 0% 42%, rgba(var(--glow-secondary-rgb), 0.1) 42% 100%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.16)),
      rgba(var(--color-bg-rgb), 0.2);
    box-shadow:
      0 18px 36px rgba(var(--shadow-rgb), 0.11),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(18px) saturate(1.05);
  }

  .post-glass-card:hover {
    box-shadow:
      0 22px 42px rgba(var(--shadow-rgb), 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
  }

  .post-glass-card__overlay {
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.18), transparent 40%),
      radial-gradient(circle at 82% 18%, rgba(var(--glow-secondary-rgb), 0.1), transparent 32%),
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.04) 0% 52%, rgba(var(--glow-secondary-rgb), 0.035) 52% 100%);
  }

  .post-glass-card__shine {
    background: linear-gradient(90deg, rgba(var(--glow-primary-rgb), 0.03), rgba(255, 255, 255, 0.28), rgba(var(--glow-secondary-rgb), 0.05));
  }

  .post-glass-avatar {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.14) 0% 50%, rgba(var(--glow-secondary-rgb), 0.09) 50% 100%),
      rgba(255, 255, 255, 0.08);
    box-shadow:
      0 10px 18px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(12px);
  }

  .post-glass-content:hover,
  .post-glass-content:focus-visible {
    background: rgba(255, 255, 255, 0.02);
  }

  .post-glass-media {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(180deg, rgba(var(--glow-primary-rgb), 0.08), rgba(var(--glow-secondary-rgb), 0.05)),
      rgba(var(--color-bg-rgb), 0.18);
    box-shadow:
      0 12px 24px rgba(var(--shadow-rgb), 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(14px);
  }

  .post-glass-media__item {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .post-glass-footer {
    border-top: 1px solid rgba(var(--glow-primary-rgb), 0.12);
  }

  .post-glass-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.5rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.1);
    border-radius: 999px;
    background: rgba(var(--color-bg-rgb), 0.12);
    color: inherit;
    opacity: 0.7;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      border-color 180ms ease,
      background-color 180ms ease,
      box-shadow 180ms ease;
  }

  .post-glass-action-btn:hover,
  .post-glass-action-btn:focus-visible {
    opacity: 1;
    transform: translateY(-1px);
    border-color: rgba(var(--glow-primary-rgb), 0.18);
    background: rgba(var(--color-bg-rgb), 0.2);
    box-shadow: 0 10px 18px rgba(var(--shadow-rgb), 0.08);
    outline: none;
  }

  .post-glass-action-btn.is-active {
    opacity: 1;
    border-color: rgba(239, 68, 68, 0.2);
    background: rgba(239, 68, 68, 0.08);
    box-shadow: 0 10px 20px rgba(239, 68, 68, 0.12);
    transform: translateY(-1px);
  }

  .post-glass-action-btn--ghost {
    padding-inline: 0.95rem;
    background: transparent;
    opacity: 0.54;
  }
</style>
