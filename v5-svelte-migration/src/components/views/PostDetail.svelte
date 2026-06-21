<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onDestroy, onMount, tick } from 'svelte';
  import { selectedPost, isAuthenticated, user, isAdmin, previewImageUrl } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';
  import { closeCommunitySurface, openCommunityProfile } from '../../lib/communityNavigation';
  import ReliableImage from '../ui/ReliableImage.svelte';
  import { softReveal } from '../../lib/motion';

  let comments: any[] = [];
  let likingComments: Set<string> = new Set();
  let loading = true;
  let newComment = '';
  let submitting = false;
  let replyTarget: any = null;
  let reporting = false;
  let likingPost = false;
  let favoritingPost = false;
  let deletingPost = false;
  let postLikeBurst = false;
  let recentCommentId = '';
  let highlightedCommentId = '';
  let pulsingCommentLikes: Set<string> = new Set();
  let reportComposerOpen = false;
  let reportReason = '';
  let reportMessage = '';
  let detailScrollEl: HTMLDivElement;
  let commentSectionEl: HTMLDivElement;
  let commentInputEl: HTMLInputElement;
  let reportInputEl: HTMLTextAreaElement;
  let lastLoadedPostId = '';
  let lastRequestedSurfaceKey = '';
  let commentsRequestToken = 0;
  let commentsRefreshInterval: ReturnType<typeof setInterval> | null = null;

  function emitPostUpdated(patch: Record<string, unknown>) {
    if (typeof window === 'undefined' || !$selectedPost?.id) return;
    window.dispatchEvent(new CustomEvent('community-post-updated', {
      detail: {
        id: $selectedPost.id,
        patch
      }
    }));
  }

  $: currentPostId = $selectedPost?.id || '';
  $: canDeletePost = Boolean($selectedPost?.can_delete || ($user?.id && $user.id === $selectedPost?.user_id) || $isAdmin);
  $: commentTree = buildCommentTree(comments);

  function buildCommentTree(items: any[]) {
    const roots: any[] = [];
    const byId = new Map<string, any>();

    for (const item of items) {
      byId.set(String(item.id), { ...item, replies: [] });
    }

    for (const item of byId.values()) {
      const parentId = item.parent_id ? String(item.parent_id) : '';
      const parent = parentId ? byId.get(parentId) : null;
      if (parent) {
        parent.replies = [...parent.replies, item];
      } else {
        roots.push(item);
      }
    }

    return roots;
  }

  function patchComment(commentId: string, patch: Record<string, unknown>) {
    comments = comments.map((item) =>
      String(item.id) === commentId
        ? {
            ...item,
            ...patch
          }
        : item
    );
  }

  function pulseCommentLike(commentId: string) {
    const next = new Set(pulsingCommentLikes);
    next.add(commentId);
    pulsingCommentLikes = next;
    window.setTimeout(() => {
      const current = new Set(pulsingCommentLikes);
      current.delete(commentId);
      pulsingCommentLikes = current;
    }, 360);
  }

  async function focusCommentRow(commentId: string, parentId = '') {
    if (!commentId) return;
    recentCommentId = commentId;
    highlightedCommentId = parentId || commentId;
    await tick();

    const row = detailScrollEl?.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(commentId)}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window.setTimeout(() => {
      if (recentCommentId === commentId) recentCommentId = '';
      if (highlightedCommentId === (parentId || commentId)) highlightedCommentId = '';
    }, 1400);
  }

  $: if (currentPostId && currentPostId !== lastLoadedPostId) {
    lastLoadedPostId = currentPostId;
    resetDetailSurface();
    void loadDetailSurface();
  }

  $: if (!currentPostId) {
    lastLoadedPostId = '';
    lastRequestedSurfaceKey = '';
  }

  $: if (currentPostId) {
    const requestedSurfaceKey = `${currentPostId}:${$selectedPost?.__focusComments ? 'comments' : 'default'}:${$selectedPost?.__openReportComposer ? 'report' : 'closed'}`;
    if (requestedSurfaceKey !== lastRequestedSurfaceKey) {
      lastRequestedSurfaceKey = requestedSurfaceKey;
      void applyRequestedSurface();
    }
  }

  function handleProfileClick(user: any) {
    openCommunityProfile(user);
  }

  function resetDetailSurface() {
    comments = [];
    likingComments = new Set();
    loading = true;
    newComment = '';
    replyTarget = null;
    reporting = false;
    reportMessage = '';
    reportReason = '';
    recentCommentId = '';
    highlightedCommentId = '';
    pulsingCommentLikes = new Set();
    reportComposerOpen = Boolean($selectedPost?.__openReportComposer);
    scrollDetailToTop();
  }

  async function loadDetailSurface() {
    await tick();
    scrollDetailToTop();
    await fetchComments();
  }

  async function applyRequestedSurface() {
    await tick();
    scrollDetailToTop();

    if ($selectedPost?.__openReportComposer) {
      reportComposerOpen = true;
      await tick();
      reportInputEl?.focus();
      return;
    }

    reportComposerOpen = false;

    if ($selectedPost?.__focusComments) {
      if (detailScrollEl && commentSectionEl) {
        detailScrollEl.scrollTo({
          top: Math.max(0, commentSectionEl.offsetTop - 24),
          left: 0,
          behavior: 'auto'
        });
      }
      await tick();
      commentInputEl?.focus();
    }
  }

  function scrollDetailToTop() {
    detailScrollEl?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }

  function normalizeComments(items: any[]) {
    return items.map((comment: any) => ({
      ...comment,
      like_count: Number(comment.like_count || 0),
      viewer_liked: Boolean(comment.viewer_liked)
    }));
  }

  function updateSelectedPostCommentCount(nextCount: number) {
    const currentCount = Number($selectedPost?.comment_count || 0);
    if (!$selectedPost || nextCount === currentCount) return;
    selectedPost.update((current) => current ? { ...current, comment_count: nextCount } : current);
    emitPostUpdated({ comment_count: nextCount });
  }

  async function fetchComments(background = false) {
    if (!$selectedPost) return;
    if (background && loading) return;
    const requestToken = ++commentsRequestToken;
    const postId = $selectedPost.id;
    if (!background) loading = true;
    try {
      const res = await communityFetch(`/api/community/comments?postId=${postId}`);
      const data = await res.json();
      if (data.ok && requestToken === commentsRequestToken && $selectedPost?.id === postId) {
        comments = Array.isArray(data.comments) ? normalizeComments(data.comments) : [];
        updateSelectedPostCommentCount(comments.length);
      }
    } catch (e) {
      if (requestToken === commentsRequestToken && $selectedPost?.id === postId && !background) {
        comments = [];
      }
      console.error('Failed to fetch comments', e);
    } finally {
      if (requestToken === commentsRequestToken && $selectedPost?.id === postId) {
        loading = false;
      }
    }
  }

  async function handleComment() {
    const content = newComment.trim();
    if (!content || submitting) return;
    const activePost = $selectedPost;
    const postId = activePost?.id;
    const submittedReplyTarget = replyTarget;
    if (!postId) return;
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    submitting = true;
    try {
      const res = await communityFetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          content,
          parent_id: replyTarget?.id || null
        })
      });
      const data = await res.json();
      if (data.ok) {
        const nextCommentCount = Number(data.comment_count ?? ((activePost.comment_count || 0) + 1));
        newComment = '';
        replyTarget = null;
        let insertedCommentId = '';
        if (data.comment) {
          insertedCommentId = String(data.comment.id || '');
          comments = [
            ...comments,
            {
              ...data.comment,
              like_count: Number(data.comment.like_count || 0),
              viewer_liked: Boolean(data.comment.viewer_liked)
            }
          ];
        }
        selectedPost.update((current) => current
          ? {
              ...current,
              comment_count: nextCommentCount,
              __focusComments: true,
              __openReportComposer: false
            }
          : current
        );
        emitPostUpdated({ comment_count: nextCommentCount });
        if (!data.comment) {
          await fetchComments();
        }
        await focusCommentRow(insertedCommentId, submittedReplyTarget?.id ? String(submittedReplyTarget.id) : '');
      }
    } catch (e) {
      console.error('Failed to post comment', e);
    } finally {
      submitting = false;
    }
  }

  async function toggleCommentLike(comment: any) {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    const commentId = String(comment?.id || '');
    if (!commentId || likingComments.has(commentId)) return;

    const nextLiking = new Set(likingComments);
    nextLiking.add(commentId);
    likingComments = nextLiking;
    const previousLiked = Boolean(comment.viewer_liked);
    const previousLikeCount = Number(comment.like_count || 0);
    const optimisticLiked = !previousLiked;
    const optimisticLikeCount = Math.max(0, previousLikeCount + (optimisticLiked ? 1 : -1));

    patchComment(commentId, {
      viewer_liked: optimisticLiked,
      like_count: optimisticLikeCount
    });
    if (optimisticLiked) pulseCommentLike(commentId);

    try {
      const res = await communityFetch('/api/community/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId })
      });
      const data = await res.json();
      if (!data.ok) {
        patchComment(commentId, {
          viewer_liked: previousLiked,
          like_count: previousLikeCount
        });
        return;
      }

      const liked = Boolean(data.liked);
      const fallbackCount = Math.max(0, previousLikeCount + (liked ? 1 : -1));
      const likeCount = Number(data.like_count ?? fallbackCount);
      patchComment(commentId, {
        viewer_liked: liked,
        like_count: likeCount
      });
    } catch (e) {
      patchComment(commentId, {
        viewer_liked: previousLiked,
        like_count: previousLikeCount
      });
      console.error('Failed to like comment', e);
    } finally {
      const next = new Set(likingComments);
      next.delete(commentId);
      likingComments = next;
    }
  }

  function startReply(comment: any) {
    replyTarget = comment;
    highlightedCommentId = String(comment?.id || '');
    void tick().then(() => {
      commentInputEl?.focus();
      window.setTimeout(() => {
        if (highlightedCommentId === String(comment?.id || '')) highlightedCommentId = '';
      }, 1200);
    });
  }

  function cancelReply() {
    replyTarget = null;
  }

  async function togglePostLike() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    if (!$selectedPost || likingPost) return;

    likingPost = true;
    const previousPost = { ...$selectedPost };
    const nextLiked = !Boolean($selectedPost.viewer_liked);
    const nextLikeCount = Math.max(0, Number($selectedPost.like_count || 0) + (nextLiked ? 1 : -1));
    selectedPost.update((current) => current
      ? { ...current, viewer_liked: nextLiked, like_count: nextLikeCount }
      : current
    );
    if (nextLiked) {
      postLikeBurst = false;
      requestAnimationFrame(() => {
        postLikeBurst = true;
        window.setTimeout(() => {
          postLikeBurst = false;
        }, 420);
      });
    }
    emitPostUpdated({ viewer_liked: nextLiked, like_count: nextLikeCount });

    try {
      const res = await communityFetch('/api/community/posts/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: $selectedPost.id })
      });
      const data = await res.json();
      if (!data.ok) {
        selectedPost.update((current) => current
          ? { ...current, viewer_liked: previousPost.viewer_liked, like_count: previousPost.like_count }
          : current
        );
        emitPostUpdated({ viewer_liked: previousPost.viewer_liked, like_count: previousPost.like_count });
        return;
      }

      const serverLiked = typeof data.liked === 'boolean' ? data.liked : data.action === 'liked';
      const fallbackCount = Math.max(0, Number(previousPost.like_count || 0) + (serverLiked ? 1 : -1));
      const serverLikeCount = Number(data.like_count ?? fallbackCount);
      selectedPost.update((current) => current
        ? { ...current, viewer_liked: serverLiked, like_count: serverLikeCount }
        : current
      );
      emitPostUpdated({ viewer_liked: serverLiked, like_count: serverLikeCount });
    } catch (e) {
      selectedPost.update((current) => current
        ? { ...current, viewer_liked: previousPost.viewer_liked, like_count: previousPost.like_count }
        : current
      );
      emitPostUpdated({ viewer_liked: previousPost.viewer_liked, like_count: previousPost.like_count });
      console.error('Failed to like post', e);
    } finally {
      likingPost = false;
    }
  }

  async function togglePostFavorite() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    if (!$selectedPost || favoritingPost) return;

    favoritingPost = true;
    try {
      const res = await communityFetch('/api/community/posts/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: $selectedPost.id })
      });
      const data = await res.json();
      if (!data.ok) return;

      const nextFavorited = Boolean(data.favorited);
      const fallbackCount = Math.max(0, Number($selectedPost.favorite_count || 0) + (nextFavorited ? 1 : -1));
      const nextFavoriteCount = Number(data.favorite_count ?? fallbackCount);
      selectedPost.update((current) => current
        ? { ...current, viewer_favorited: nextFavorited, favorite_count: nextFavoriteCount }
        : current
      );
      emitPostUpdated({ viewer_favorited: nextFavorited, favorite_count: nextFavoriteCount });
    } catch (e) {
      console.error('Failed to favorite post', e);
    } finally {
      favoritingPost = false;
    }
  }

  async function deletePost() {
    if (!$selectedPost || deletingPost || !canDeletePost) return;
    if (!confirm('确定删除这条帖子吗？')) return;

    deletingPost = true;
    try {
      const res = await communityFetch('/api/community/posts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: $selectedPost.id })
      });
      const data = await res.json();
      if (data.ok) {
        window.dispatchEvent(new CustomEvent('community-post-deleted', { detail: { id: $selectedPost.id } }));
        close();
      }
    } catch (e) {
      console.error('Failed to delete post', e);
    } finally {
      deletingPost = false;
    }
  }

  async function submitReport() {
    const reason = reportReason.trim();
    if (!reason || !$selectedPost) return;
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    reporting = true;
    reportMessage = '';

    try {
      const res = await communityFetch('/api/community/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'post',
          target_id: $selectedPost.id,
          reason
        })
      });
      const data = await res.json();

      if (data.ok) {
        reportReason = '';
        reportComposerOpen = false;
        reportMessage = '举报已提交，我们会尽快处理。';
        selectedPost.update((current) => current
          ? {
              ...current,
              __openReportComposer: false
            }
          : current
        );
        emitPostUpdated({ __openReportComposer: false });
      } else {
        reportMessage = data.msg || '举报没有发出去。';
      }
    } catch (e) {
      console.error('Failed to submit report', e);
      reportMessage = '举报没有发出去。';
    } finally {
      reporting = false;
    }
  }

  function toggleReportComposer() {
    reportComposerOpen = !reportComposerOpen;
    reportMessage = '';
    if (reportComposerOpen) {
      selectedPost.update((current) => current
        ? {
            ...current,
            __openReportComposer: true,
            __focusComments: false
          }
        : current
      );
      void tick().then(() => reportInputEl?.focus());
      return;
    }

    selectedPost.update((current) => current
      ? {
          ...current,
          __openReportComposer: false
        }
      : current
    );
  }

  function close() {
    closeCommunitySurface(() => selectedPost.set(null));
  }

  function safeJsonArray(json: string | null | undefined) {
    try {
      if (!json) return [];
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  let media: any[] = [];

  $: media = $selectedPost ? safeJsonArray($selectedPost.media_json || '').filter((m) => m && m.url) : [];

  onMount(() => {
    commentsRefreshInterval = setInterval(() => {
      if (currentPostId) void fetchComments(true);
    }, 8000);
  });

  onDestroy(() => {
    if (commentsRefreshInterval) clearInterval(commentsRefreshInterval);
  });
</script>

{#if $selectedPost}
  <div data-testid="post-detail" class="post-detail-frame fixed inset-0 z-[11000] p-2 sm:p-4">
    <div class="post-detail-backdrop absolute inset-0" aria-hidden="true"></div>
    <div
      class="post-detail-shell relative flex h-full flex-col overflow-hidden"
      transition:softReveal={{ x: 10, y: 0, duration: 320, startScale: 0.996, blur: 2 }}
    >
      <header class="post-detail-header flex items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <button type="button" data-testid="post-detail-close" on:click={close} aria-label="返回动态列表" class="post-detail-toolbar-button p-2 -ml-2 transition-all">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <h2 class="text-center text-base font-black uppercase tracking-tighter sm:text-xl">这条内容</h2>
        <button
          type="button"
          aria-label="打开举报面板"
          class="post-detail-pill-button rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all sm:px-4"
          on:click={toggleReportComposer}
        >
          举报
        </button>
      </header>

      <div bind:this={detailScrollEl} class="post-detail-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div class="mx-auto max-w-3xl">
          {#if reportComposerOpen}
            <section class="post-detail-report-panel mb-8 rounded-[28px] p-4 sm:p-5">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-100/60">举报内容</p>
                  <h3 class="mt-2 text-xl font-black tracking-tight">把问题写清楚，我们会跟进处理。</h3>
                </div>
                <button
                  type="button"
                  aria-label="收起举报面板"
                  class="post-detail-report-button rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all"
                  on:click={toggleReportComposer}
                >
                  收起
                </button>
              </div>

              <textarea
                bind:this={reportInputEl}
                bind:value={reportReason}
                rows="3"
                placeholder="例如：辱骂、人身攻击、恶意广告、盗图。"
                class="post-detail-report-input mt-4 w-full rounded-[22px] px-4 py-3 text-sm font-medium leading-7 text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 outline-none transition-all"
              ></textarea>

              <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-xs font-bold text-red-100/70">举报会附上当前帖子 id 和你的账号信息。</p>
                <button
                  type="button"
                  aria-label="提交举报"
                  class="post-detail-report-submit inline-flex items-center justify-center rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all disabled:opacity-50 disabled:hover:scale-100"
                  on:click={submitReport}
                  disabled={reporting || !reportReason.trim()}
                >
                  {reporting ? '正在提交…' : '提交举报'}
                </button>
              </div>
            </section>
          {/if}

          {#if reportMessage}
            <p class="post-detail-message mb-6 rounded-[22px] px-4 py-3 text-sm font-bold opacity-80">{reportMessage}</p>
          {/if}

          <div class="post-detail-author mb-8 flex items-center gap-4 rounded-[28px] px-4 py-4 sm:px-5">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div on:click={() => handleProfileClick($selectedPost)} class="post-detail-avatar h-14 w-14 cursor-pointer overflow-hidden rounded-full">
              {#if $selectedPost.avatar_url}
                <img src={$selectedPost.avatar_url} alt={$selectedPost.username} class="h-full w-full object-cover" />
              {:else}
                <div class="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--color-primary)]">
                  {$selectedPost.username?.slice(0, 1).toUpperCase() || '?'}
                </div>
              {/if}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <span on:click={() => handleProfileClick($selectedPost)} class="cursor-pointer text-lg font-black tracking-tight transition-colors hover:text-[var(--color-primary)]">{$selectedPost.username}</span>
                {#if $selectedPost.role === 'admin'}
                  <span class="rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">管理员</span>
                {/if}
              </div>
              <p class="text-xs font-bold uppercase tracking-widest opacity-30">
                {new Date($selectedPost.created_at || Date.now()).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>

          <div class="post-detail-actions mb-8 flex flex-wrap items-center gap-2.5 rounded-[28px] px-4 py-3 sm:px-5">
            <button
              type="button"
              data-testid="post-detail-like"
              class="post-detail-action-button {Boolean($selectedPost.viewer_liked) ? 'is-active' : ''} {postLikeBurst ? 'is-bursting' : ''}"
              aria-pressed={Boolean($selectedPost.viewer_liked)}
              on:click={togglePostLike}
              disabled={likingPost}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill={$selectedPost.viewer_liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78a5.5 5.5 0 0 0 1.06-8.84z"></path></svg>
              <span>{$selectedPost.like_count || 0}</span>
            </button>

            <button
              type="button"
              data-testid="post-detail-favorite"
              class="post-detail-action-button {Boolean($selectedPost.viewer_favorited) ? 'is-favorited' : ''}"
              aria-pressed={Boolean($selectedPost.viewer_favorited)}
              on:click={togglePostFavorite}
              disabled={favoritingPost}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill={$selectedPost.viewer_favorited ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3 12 2"></polygon></svg>
              <span>{$selectedPost.favorite_count || 0}</span>
            </button>

            {#if canDeletePost}
              <button type="button" data-testid="post-detail-delete" class="post-detail-action-button is-danger" on:click={deletePost} disabled={deletingPost}>
                删除
              </button>
            {/if}
          </div>

          <div class="post-detail-content-panel mb-8 rounded-[32px] px-5 py-6 sm:px-6 sm:py-7">
            <p class="whitespace-pre-wrap text-xl font-medium leading-relaxed">
              {$selectedPost.content}
            </p>
          </div>

          {#if media.length > 0}
            <div class="mb-12 space-y-4">
              {#each media as item, i}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="post-detail-media-frame min-h-[220px] cursor-pointer overflow-hidden rounded-3xl transition-transform hover:scale-[1.01]" on:click={() => previewImageUrl.set(item.url)}>
                  <ReliableImage
                    src={item.url}
                    alt="Content"
                    imgClass="block h-auto w-full"
                    wrapperClass="min-h-[220px] bg-white/5"
                    retries={3}
                    retryDelay={550}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </div>
              {/each}
            </div>
          {/if}

          <div bind:this={commentSectionEl} class="post-detail-comments border-t border-white/10 pt-10 pb-10 sm:pt-12 sm:pb-12">
            <h3 class="mb-8 flex items-center gap-3 text-2xl font-black uppercase tracking-tighter">
              留言
              <span class="text-sm font-bold opacity-30">({$selectedPost.comment_count || 0})</span>
            </h3>

            {#if loading}
              <div class="space-y-6">
                {#each Array(3) as _}
                  <div class="flex animate-pulse gap-4">
                    <div class="h-10 w-10 rounded-full bg-white/5"></div>
                    <div class="flex-1 space-y-2">
                      <div class="h-4 w-24 rounded bg-white/5"></div>
                      <div class="h-12 w-full rounded-xl bg-white/5"></div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else if commentTree.length > 0}
              <div class="space-y-4 sm:space-y-5">
                {#each commentTree as comment}
                  <div
                    class="post-detail-comment-row flex gap-4 rounded-[24px] px-3 py-3 sm:px-4 {recentCommentId === String(comment.id) ? 'is-new' : ''} {highlightedCommentId === String(comment.id) ? 'is-highlighted' : ''}"
                    data-testid="comment-row"
                    data-comment-id={comment.id}
                    in:fade={{ duration: 180 }}
                  >
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div on:click={() => handleProfileClick(comment)} class="post-detail-comment-avatar h-10 w-10 flex-shrink-0 cursor-pointer overflow-hidden rounded-full">
                      {#if comment.avatar_url}
                        <img src={comment.avatar_url} alt={comment.username} class="h-full w-full object-cover" />
                      {:else}
                        <div class="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--color-primary)]">
                          {comment.username?.slice(0, 1).toUpperCase() || '?'}
                        </div>
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="mb-1 flex items-center gap-2">
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <span on:click={() => handleProfileClick(comment)} class="cursor-pointer text-sm font-bold tracking-tight transition-colors hover:text-[var(--color-primary)]">{comment.username}</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest opacity-30">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <p class="whitespace-pre-wrap text-sm font-medium leading-relaxed opacity-80">
                        {comment.content}
                      </p>

                      <div class="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          class="post-detail-comment-like inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition-all {comment.viewer_liked ? 'is-active' : ''} {pulsingCommentLikes.has(String(comment.id)) ? 'is-pulsing' : ''}"
                          aria-label={comment.viewer_liked ? '取消点赞这条评论' : '点赞这条评论'}
                          aria-pressed={Boolean(comment.viewer_liked)}
                          disabled={likingComments.has(comment.id)}
                          on:click={() => toggleCommentLike(comment)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={comment.viewer_liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78a5.5 5.5 0 0 0 1.06-8.84z"></path></svg>
                          <span class="like-count" aria-live="polite">{comment.like_count || 0}</span>
                        </button>
                        <button type="button" data-testid="comment-reply" class="post-detail-comment-like inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-black transition-all" on:click={() => startReply(comment)}>
                          回复
                        </button>
                      </div>

                      {#if comment.replies?.length}
                        <div class="mt-3 space-y-2 border-l border-white/10 pl-3">
                          {#each comment.replies as reply}
                            <div
                              class="post-detail-reply rounded-[18px] px-3 py-2 {recentCommentId === String(reply.id) ? 'is-new' : ''}"
                              data-testid="comment-reply-row"
                              data-comment-id={reply.id}
                              in:fade={{ duration: 180 }}
                            >
                              <div class="flex flex-wrap items-center gap-2">
                                <button type="button" class="text-xs font-black transition-colors hover:text-[var(--color-primary)]" on:click={() => handleProfileClick(reply)}>
                                  {reply.username}
                                </button>
                                <span class="text-[10px] font-bold uppercase tracking-widest opacity-30">
                                  {new Date(reply.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <p class="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed opacity-78">{reply.content}</p>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <button type="button" class="post-detail-comment-like inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition-all {reply.viewer_liked ? 'is-active' : ''} {pulsingCommentLikes.has(String(reply.id)) ? 'is-pulsing' : ''}" on:click={() => toggleCommentLike(reply)}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill={reply.viewer_liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78a5.5 5.5 0 0 0 1.06-8.84z"></path></svg>
                                  <span class="like-count" aria-live="polite">{reply.like_count || 0}</span>
                                </button>
                                <button type="button" class="post-detail-comment-like inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-black transition-all" on:click={() => startReply(comment)}>回复</button>
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="py-12 text-center text-sm font-black uppercase tracking-widest opacity-20">
                还没人留言。
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="post-detail-composer-wrap shrink-0 px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
        <div class="post-detail-composer mx-auto flex max-w-3xl flex-col gap-3">
          {#if replyTarget}
            <div class="post-detail-reply-target flex items-center justify-between gap-3 rounded-2xl px-4 py-2 text-xs font-bold">
              <span class="truncate">正在回复 {replyTarget.username}</span>
              <button type="button" class="font-black uppercase tracking-[0.16em] opacity-70 transition-opacity hover:opacity-100" on:click={cancelReply}>取消</button>
            </div>
          {/if}
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <input
            bind:this={commentInputEl}
            data-testid="comment-input"
            type="text"
            bind:value={newComment}
            placeholder="想回一句什么，就写在这里。"
            class="post-detail-composer-input min-w-0 flex-1 rounded-2xl px-5 py-4 font-bold text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 outline-none transition-all"
            disabled={submitting}
            on:keydown={(e) => e.key === 'Enter' && !submitting && handleComment()}
          />
          <button
            type="button"
            data-testid="comment-submit"
            on:click={handleComment}
            aria-label="发布评论"
            disabled={submitting || !newComment.trim()}
            class="post-detail-composer-submit inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-5 text-[var(--color-bg,#231b22)] transition-all hover:scale-[1.015] active:scale-[0.985] disabled:opacity-30 disabled:hover:scale-100 {submitting ? 'is-sending' : ''}"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            <span class="text-xs font-black uppercase tracking-[0.18em]">{submitting ? '发布中…' : '发布评论'}</span>
          </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .post-detail-frame {
    isolation: isolate;
  }

  .post-detail-backdrop {
    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(4px);
  }

  .post-detail-shell {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    border-radius: 2rem;
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.08)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.2)),
      rgba(var(--color-bg-rgb), 0.72);
    box-shadow:
      0 28px 80px rgba(var(--shadow-rgb), 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(22px) saturate(1.04);
  }

  .post-detail-header {
    padding-top: max(1rem, env(safe-area-inset-top, 0px));
    border-bottom: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.7), rgba(var(--color-bg-rgb), 0.24)),
      rgba(var(--color-bg-rgb), 0.18);
    backdrop-filter: blur(18px);
  }

  .post-detail-scroll {
    scrollbar-gutter: stable both-edges;
  }

  .post-detail-toolbar-button,
  .post-detail-pill-button,
  .post-detail-report-button {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.12)),
      rgba(var(--color-bg-rgb), 0.2);
    box-shadow:
      0 10px 24px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .post-detail-toolbar-button {
    opacity: 0.72;
  }

  .post-detail-toolbar-button:hover,
  .post-detail-pill-button:hover,
  .post-detail-report-button:hover,
  .post-detail-report-submit:hover,
  .post-detail-composer-submit:hover {
    transform: translateY(-1px);
  }

  .post-detail-author,
  .post-detail-actions,
  .post-detail-content-panel,
  .post-detail-media-frame,
  .post-detail-comment-row,
  .post-detail-message {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.08), rgba(var(--glow-secondary-rgb), 0.05)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.12)),
      rgba(var(--color-bg-rgb), 0.18);
    box-shadow:
      0 18px 42px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
  }

  .post-detail-composer,
  .post-detail-reply-target {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(var(--color-bg-rgb), 0.1)),
      rgba(var(--color-bg-rgb), 0.2);
    box-shadow:
      0 14px 32px rgba(var(--shadow-rgb), 0.11),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
  }

  .post-detail-composer {
    border-radius: 1.6rem;
    padding: 0.65rem;
  }

  .post-detail-action-button {
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.1)),
      rgba(var(--color-bg-rgb), 0.12);
    padding: 0.55rem 0.9rem;
    font-size: 0.72rem;
    font-weight: 900;
    opacity: 0.74;
    transition: transform 180ms ease, opacity 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  .post-detail-action-button:hover {
    opacity: 1;
    transform: translateY(-1px);
  }

  .post-detail-action-button.is-active {
    color: rgb(248, 113, 113);
    border-color: rgba(248, 113, 113, 0.24);
    background: rgba(248, 113, 113, 0.08);
  }

  .post-detail-action-button.is-favorited {
    color: var(--color-primary);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
    background: rgba(var(--glow-primary-rgb), 0.1);
  }

  .post-detail-action-button.is-danger {
    color: rgb(252, 165, 165);
    border-color: rgba(248, 113, 113, 0.18);
    background: rgba(127, 29, 29, 0.08);
  }

  .post-detail-action-button.is-bursting svg {
    animation: post-detail-like-burst 420ms var(--motion-ease-apple);
  }

  .post-detail-report-panel {
    border: 1px solid rgba(248, 113, 113, 0.24);
    background:
      linear-gradient(145deg, rgba(248, 113, 113, 0.16), rgba(127, 29, 29, 0.12)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(127, 29, 29, 0.16)),
      rgba(69, 10, 10, 0.24);
    box-shadow:
      0 20px 46px rgba(15, 23, 42, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(18px);
  }

  .post-detail-avatar,
  .post-detail-comment-avatar {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.18), rgba(var(--glow-secondary-rgb), 0.08)),
      rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(14px);
  }

  .post-detail-report-input,
  .post-detail-composer-input {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.14)),
      rgba(var(--color-bg-rgb), 0.24);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(14px);
  }

  .post-detail-report-input:focus,
  .post-detail-composer-input:focus {
    border-color: rgba(var(--glow-primary-rgb), 0.32);
    box-shadow:
      0 0 0 2px rgba(var(--glow-primary-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .post-detail-report-button {
    color: rgba(255, 241, 242, 0.84);
    background:
      linear-gradient(180deg, rgba(127, 29, 29, 0.28), rgba(69, 10, 10, 0.18)),
      rgba(69, 10, 10, 0.24);
    border-color: rgba(252, 165, 165, 0.18);
  }

  .post-detail-report-submit,
  .post-detail-composer-submit {
    background: var(--color-primary, #fac7b7);
    box-shadow:
      0 16px 34px rgba(var(--shadow-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .post-detail-comments {
    border-top-color: rgba(var(--glow-primary-rgb), 0.12);
  }

  .post-detail-comment-like {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(var(--color-bg-rgb), 0.1)),
      rgba(var(--color-bg-rgb), 0.12);
    color: color-mix(in srgb, var(--color-text, #fff4ed) 74%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .post-detail-comment-like:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--glow-primary-rgb), 0.2);
  }

  .post-detail-comment-like svg,
  .post-detail-comment-like .like-count,
  .post-detail-action-button svg,
  .post-detail-action-button span {
    transform-origin: center;
    transition:
      transform var(--motion-duration-fast) var(--motion-ease-apple),
      color var(--motion-duration-fast) var(--motion-ease-standard);
  }

  .post-detail-comment-like.is-active {
    border-color: rgba(248, 113, 113, 0.28);
    color: rgb(248, 113, 113);
    background:
      linear-gradient(180deg, rgba(248, 113, 113, 0.14), rgba(var(--color-bg-rgb), 0.1)),
      rgba(var(--color-bg-rgb), 0.12);
  }

  .post-detail-comment-like.is-pulsing svg {
    animation: comment-like-press 360ms var(--motion-ease-apple);
  }

  .post-detail-comment-like.is-pulsing .like-count {
    animation: count-soft-rise 360ms var(--motion-ease-apple);
  }

  .post-detail-reply {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.09);
    background: rgba(var(--color-bg-rgb), 0.13);
  }

  .post-detail-comment-row,
  .post-detail-reply {
    position: relative;
    overflow: hidden;
    transition:
      background-color 260ms var(--motion-ease-standard),
      border-color 260ms var(--motion-ease-standard),
      transform 260ms var(--motion-ease-apple);
  }

  .post-detail-comment-row.is-new,
  .post-detail-reply.is-new {
    animation: comment-settle 560ms var(--motion-ease-apple) both;
  }

  .post-detail-comment-row.is-highlighted,
  .post-detail-comment-row.is-new,
  .post-detail-reply.is-new {
    border-color: color-mix(in srgb, var(--clay) 34%, var(--hairline));
    background: color-mix(in srgb, var(--clay) 8%, var(--surface));
  }

  .post-detail-comment-row.is-highlighted::after,
  .post-detail-comment-row.is-new::after,
  .post-detail-reply.is-new::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--glow-primary-rgb), 0.12), transparent);
    transform: translateX(-105%);
    animation: comment-warm-sweep 880ms var(--motion-ease-apple) both;
  }

  .post-detail-comment-like:disabled {
    cursor: progress;
    opacity: 0.62;
    transform: none;
  }

  .post-detail-composer-wrap {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    pointer-events: none;
    padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
    background: linear-gradient(180deg, rgba(var(--color-bg-rgb), 0) 0%, rgba(var(--color-bg-rgb), 0.18) 30%, rgba(var(--color-bg-rgb), 0.42) 100%);
  }

  .post-detail-composer {
    pointer-events: auto;
  }

  .post-detail-composer-submit {
    position: relative;
    overflow: hidden;
  }

  .post-detail-composer-submit.is-sending::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
    transform: translateX(-105%);
    animation: composer-sending-sheen 920ms var(--motion-ease-apple) infinite;
  }

  .post-detail-backdrop {
    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(4px);
  }

  .post-detail-shell {
    border-color: var(--hairline-strong);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 24px 70px rgba(var(--shadow-rgb), 0.18);
    backdrop-filter: none;
  }

  .post-detail-header,
  .post-detail-composer-wrap {
    background: var(--surface);
    border-color: var(--hairline);
    backdrop-filter: none;
  }

  .post-detail-toolbar-button,
  .post-detail-pill-button,
  .post-detail-report-button,
  .post-detail-author,
  .post-detail-actions,
  .post-detail-content-panel,
  .post-detail-media-frame,
  .post-detail-comment-row,
  .post-detail-message,
  .post-detail-composer,
  .post-detail-reply-target,
  .post-detail-reply {
    border-color: var(--hairline);
    background: var(--paper);
    color: var(--ink);
    box-shadow: none;
    backdrop-filter: none;
  }

  .post-detail-content-panel {
    background: var(--surface);
  }

  .post-detail-toolbar-button,
  .post-detail-pill-button,
  .post-detail-report-button {
    background: transparent;
  }

  .post-detail-avatar,
  .post-detail-comment-avatar {
    border-color: var(--hairline);
    background: var(--surface);
    box-shadow: none;
    backdrop-filter: none;
  }

  .post-detail-report-input,
  .post-detail-composer-input {
    border-color: var(--hairline-strong);
    background: var(--surface);
    color: var(--ink) !important;
    box-shadow: none;
    backdrop-filter: none;
  }

  .post-detail-report-input:focus,
  .post-detail-composer-input:focus {
    border-color: var(--clay);
    box-shadow: 0 0 0 2px rgba(var(--glow-primary-rgb), 0.12);
  }

  .post-detail-report-panel {
    border-color: rgba(178, 54, 42, 0.22);
    background: rgba(178, 54, 42, 0.06);
    color: var(--ink);
    box-shadow: none;
    backdrop-filter: none;
  }

  .post-detail-report-panel :global([class*=text-red]) {
    color: #8b2e24 !important;
  }

  .post-detail-report-submit,
  .post-detail-composer-submit {
    background: var(--clay);
    color: var(--paper) !important;
    box-shadow: none;
  }

  .post-detail-action-button,
  .post-detail-comment-like {
    border-color: var(--hairline);
    background: var(--surface);
    color: var(--ink-soft);
    box-shadow: none;
  }

  .post-detail-action-button.is-active,
  .post-detail-comment-like.is-active {
    color: #8b2e24;
    border-color: rgba(178, 54, 42, 0.22);
    background: rgba(178, 54, 42, 0.07);
  }

  .post-detail-action-button.is-favorited {
    color: var(--clay);
    border-color: color-mix(in srgb, var(--clay) 34%, var(--hairline));
    background: color-mix(in srgb, var(--clay) 10%, var(--surface));
  }

  .post-detail-action-button.is-danger {
    color: #8b2e24;
    border-color: rgba(178, 54, 42, 0.22);
    background: rgba(178, 54, 42, 0.06);
  }

  .post-detail-comments {
    border-top-color: var(--hairline);
  }

  .post-detail-comments :global([class*=border-white]),
  .post-detail-scroll :global([class*=border-white]) {
    border-color: var(--hairline) !important;
  }

  .post-detail-comments :global([class*=bg-white]),
  .post-detail-scroll :global([class*=bg-white]) {
    background: var(--paper) !important;
  }

  @media (max-width: 639px) {
    .post-detail-frame {
      padding: 0;
    }

    .post-detail-shell {
      border-radius: 0;
    }

    .post-detail-scroll {
      padding-top: 1.25rem;
    }
  }

  @keyframes post-detail-like-burst {
    0% {
      transform: scale(0.9) rotate(-3deg);
      filter: drop-shadow(0 0 0 rgba(248, 113, 113, 0));
    }
    46% {
      transform: scale(1.16) rotate(3deg);
      filter: drop-shadow(0 0 8px rgba(248, 113, 113, 0.28));
    }
    100% {
      transform: scale(1) rotate(0deg);
      filter: drop-shadow(0 0 0 rgba(248, 113, 113, 0));
    }
  }

  @keyframes comment-like-press {
    0% {
      transform: scale(0.92);
    }
    48% {
      transform: scale(1.14);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes count-soft-rise {
    0% {
      opacity: 0.72;
      transform: translateY(2px);
    }
    54% {
      opacity: 1;
      transform: translateY(-2px);
    }
    100% {
      transform: translateY(0);
    }
  }

  @keyframes comment-settle {
    0% {
      opacity: 0;
      transform: translate3d(0, 10px, 0) scale(0.994);
    }
    100% {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
    }
  }

  @keyframes comment-warm-sweep {
    0% {
      opacity: 0;
      transform: translateX(-105%);
    }
    22% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(105%);
    }
  }

  @keyframes composer-sending-sheen {
    0% {
      transform: translateX(-105%);
    }
    100% {
      transform: translateX(105%);
    }
  }
</style>
