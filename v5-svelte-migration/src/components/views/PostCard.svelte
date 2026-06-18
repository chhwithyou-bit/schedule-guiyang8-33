<script lang="ts">
  import { isAdmin, isAuthenticated, user, previewImageUrl } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';
  import { openCommunityPost, openCommunityProfile } from '../../lib/communityNavigation';
  import ReliableImage from '../ui/ReliableImage.svelte';

  export let post: any;

  let isLiking = false;
  let isFavoriting = false;
  let isDeleting = false;

  function emitPostUpdated(patch: Record<string, unknown>) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('community-post-updated', { detail: { id: post.id, patch } }));
  }

  function safeJsonArray(json: string | null | undefined) {
    try {
      const arr = JSON.parse(json || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  $: media = safeJsonArray(post.media_json).filter((item) => item && item.url);
  $: canDelete = Boolean(post.can_delete || ($user?.id && $user.id === post.user_id) || $isAdmin);
  $: dateStr = post.created_at
    ? new Date(post.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '刚刚';

  function handleProfileClick(event: MouseEvent) {
    event.stopPropagation();
    openCommunityProfile(post);
  }

  function openPostDetail(mode: 'default' | 'comments' | 'report' = 'default') {
    openCommunityPost(post, mode);
  }

  function handleCommentClick(event: MouseEvent) {
    event.stopPropagation();
    openPostDetail('comments');
  }

  function handleReportClick(event: MouseEvent) {
    event.stopPropagation();
    openPostDetail('report');
  }

  async function toggleLike(event: MouseEvent) {
    event.stopPropagation();
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    if (isLiking) return;

    isLiking = true;
    try {
      const res = await communityFetch('/api/community/posts/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id })
      });
      const data = await res.json();
      if (data.ok) {
        const nextLiked = typeof data.liked === 'boolean' ? data.liked : data.action === 'liked';
        const fallbackCount = Math.max(0, Number(post.like_count || 0) + (nextLiked ? 1 : -1));
        const nextLikeCount = Number(data.like_count ?? fallbackCount);
        post.viewer_liked = nextLiked;
        post.like_count = nextLikeCount;
        emitPostUpdated({ viewer_liked: nextLiked, like_count: nextLikeCount });
      }
    } catch (error) {
      console.error('Like failed', error);
    } finally {
      isLiking = false;
    }
  }

  async function toggleFavorite(event: MouseEvent) {
    event.stopPropagation();
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    if (isFavoriting) return;

    isFavoriting = true;
    try {
      const res = await communityFetch('/api/community/posts/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id })
      });
      const data = await res.json();
      if (data.ok) {
        const nextFavorited = Boolean(data.favorited);
        const fallbackCount = Math.max(0, Number(post.favorite_count || 0) + (nextFavorited ? 1 : -1));
        const nextFavoriteCount = Number(data.favorite_count ?? fallbackCount);
        post.viewer_favorited = nextFavorited;
        post.favorite_count = nextFavoriteCount;
        emitPostUpdated({ viewer_favorited: nextFavorited, favorite_count: nextFavoriteCount });
      }
    } catch (error) {
      console.error('Favorite failed', error);
    } finally {
      isFavoriting = false;
    }
  }

  async function deletePost(event: MouseEvent) {
    event.stopPropagation();
    if (!canDelete || isDeleting) return;
    if (!confirm('确定删除这条帖子吗？')) return;

    isDeleting = true;
    try {
      const res = await communityFetch('/api/community/posts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id })
      });
      const data = await res.json();
      if (data.ok) {
        window.dispatchEvent(new CustomEvent('community-post-deleted', { detail: { id: post.id } }));
      }
    } catch (error) {
      console.error('Delete post failed', error);
    } finally {
      isDeleting = false;
    }
  }
</script>

<article data-testid="post-card" data-motion-role="post-card" class="post-card">
  <header class="post-head">
    <button type="button" data-testid="post-author-avatar" on:click={handleProfileClick} aria-label={`打开 ${post.username || '用户'} 的主页`} class="post-avatar">
      {#if post.avatar_url}
        <img src={post.avatar_url} alt={post.username} />
      {:else}
        <span>{post.username?.slice(0, 1).toUpperCase() || '?'}</span>
      {/if}
    </button>

    <div class="post-meta">
      <div class="post-author">
        <span>{post.username || 'Anonymous'}</span>
        <span class="lvl">Lv.{post.level || 1}</span>
        {#if post.role === 'admin'}<span class="lvl">管理员</span>{/if}
      </div>
      <time>{dateStr}</time>
    </div>
  </header>

  <button type="button" on:click={() => openPostDetail()} aria-label="打开动态详情" class="post-body-button">
    <p class="post-body">{post.content}</p>
  </button>

  {#if media.length > 0}
    <div class="post-media {media.length > 1 ? 'is-grid' : ''}" aria-label="动态图片">
      {#each media.slice(0, 4) as item, index}
        {#if index === 3 && media.length > 4}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="media-cell cursor-pointer" on:click={() => openPostDetail()}>
            <ReliableImage src={item.url} alt="Post media" imgClass="h-full w-full object-cover" retries={2} retryDelay={500} loading="lazy" />
            <span class="more">+{media.length - 4}</span>
          </div>
        {:else}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="media-cell cursor-pointer transition-transform hover:scale-[1.02] hover:z-10" on:click={(e) => { e.stopPropagation(); previewImageUrl.set(item.url); }}>
            <ReliableImage src={item.url} alt="Post media" imgClass="h-full w-full object-cover" retries={2} retryDelay={500} loading="lazy" />
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <footer class="post-actions">
    <button type="button" data-testid="post-like" on:click={toggleLike} aria-label="点赞这条内容" class:active={post.viewer_liked} disabled={isLiking}>
      <span aria-hidden="true">♡</span>{post.like_count || 0}
    </button>
    <button type="button" data-testid="post-comment" on:click={handleCommentClick} aria-label="查看评论">
      <span aria-hidden="true">◦</span>{post.comment_count || 0}
    </button>
    <button type="button" data-testid="post-favorite" on:click={toggleFavorite} aria-label={post.viewer_favorited ? '取消收藏这条帖子' : '收藏这条帖子'} aria-pressed={Boolean(post.viewer_favorited)} class:active={post.viewer_favorited} disabled={isFavoriting}>
      <span aria-hidden="true">☆</span>{post.favorite_count || 0}
    </button>
    {#if canDelete}
      <button type="button" data-testid="post-delete" on:click={deletePost} aria-label="删除这条帖子" disabled={isDeleting}>删除</button>
    {/if}
    <button type="button" data-testid="post-report" on:click={handleReportClick} aria-label="举报这条内容">举报</button>
  </footer>
</article>

<style>
  .post-card {
    padding: var(--s4) 0;
    border-top: 1px solid var(--hairline);
  }

  .post-card:first-child {
    border-top: none;
  }

  .post-head {
    display: flex;
    align-items: center;
    gap: var(--s2);
    margin-bottom: var(--s3);
  }

  .post-avatar {
    display: grid;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    place-items: center;
    overflow: hidden;
    border-radius: 999px;
    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 600;
    transition: transform 180ms var(--motion-ease-apple);
  }

  .post-avatar:hover {
    transform: translateY(-1px);
  }

  .post-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .post-meta {
    min-width: 0;
  }

  .post-author {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s1);
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 500;
    color: var(--ink);
  }

  .post-meta time {
    display: block;
    margin-top: 1px;
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 13px;
  }

  .lvl {
    border: 1px solid var(--clay-light);
    border-radius: 4px;
    color: var(--clay);
    font-family: var(--sans);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 1px 5px;
  }

  .post-body-button {
    display: block;
    width: 100%;
    text-align: left;
  }

  .post-body {
    max-width: 60ch;
    margin-bottom: var(--s3);
    white-space: pre-wrap;
    color: var(--ink);
    font-family: var(--serif);
    font-size: 18px;
    line-height: 1.65;
  }

  .post-media {
    display: grid;
    width: min(560px, 100%);
    aspect-ratio: 16 / 9;
    margin-bottom: var(--s3);
    overflow: hidden;
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    background: var(--surface);
  }

  .post-media.is-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    aspect-ratio: 1.35;
  }

  .media-cell {
    position: relative;
    min-height: 0;
    overflow: hidden;
    background: var(--paper);
  }

  .more {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(25, 25, 25, 0.42);
    color: white;
    font-family: var(--sans);
    font-size: 1.4rem;
    font-weight: 600;
  }

  .post-actions {
    display: flex;
    flex-wrap: wrap;
    gap: clamp(0.85rem, 3vw, var(--s4));
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 13px;
  }

  .post-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: color 180ms var(--motion-ease-apple), transform 180ms var(--motion-ease-apple);
  }

  .post-actions button:hover {
    color: var(--ink);
    transform: translateY(-1px);
  }

  .post-actions button.active {
    color: var(--clay);
  }
</style>
