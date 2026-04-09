<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { tick } from 'svelte';
  import { selectedPost, isAuthenticated, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';
  import ReliableImage from '../ui/ReliableImage.svelte';

  let comments: any[] = [];
  let loading = true;
  let newComment = '';
  let submitting = false;
  let reporting = false;
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
    selectedPost.update((current) => current
      ? {
          ...current,
          __focusComments: false,
          __openReportComposer: false
        }
      : current
    );

    selectedProfile.set({
      id: user.id || user.user_id,
      username: user.username,
      avatar_url: user.avatar_url,
      role: user.role,
      signature: user.signature,
      background_url: user.background_url
    });
  }

  function resetDetailSurface() {
    comments = [];
    loading = true;
    newComment = '';
    reporting = false;
    reportMessage = '';
    reportReason = '';
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
      commentSectionEl?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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

  async function fetchComments() {
    if (!$selectedPost) return;
    const requestToken = ++commentsRequestToken;
    const postId = $selectedPost.id;
    loading = true;
    try {
      const res = await communityFetch(`/api/community/comments?postId=${postId}`);
      const data = await res.json();
      if (data.ok && requestToken === commentsRequestToken && $selectedPost?.id === postId) {
        comments = Array.isArray(data.comments) ? data.comments : [];
      }
    } catch (e) {
      if (requestToken === commentsRequestToken && $selectedPost?.id === postId) {
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
    if (!content) return;
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
          post_id: $selectedPost.id,
          content
        })
      });
      const data = await res.json();
      if (data.ok) {
        const nextCommentCount = ($selectedPost?.comment_count || 0) + 1;
        newComment = '';
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
        await fetchComments();
      }
    } catch (e) {
      console.error('Failed to post comment', e);
    } finally {
      submitting = false;
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
    selectedPost.set(null);
  }

  function safeJsonArray(json: string) {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  let media: any[] = [];

  $: media = $selectedPost ? safeJsonArray($selectedPost.media_json).filter((m) => m && m.url) : [];
</script>

{#if $selectedPost}
  <div class="post-detail-frame fixed inset-0 z-[6000] p-2 sm:p-4">
    <div class="post-detail-backdrop absolute inset-0" aria-hidden="true"></div>
    <div
      class="post-detail-shell relative flex h-full flex-col overflow-hidden"
      transition:fly={{ x: 44, duration: 320, easing: (t) => t * (2 - t) }}
    >
      <header class="post-detail-header flex items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <button on:click={close} aria-label="返回动态列表" class="post-detail-toolbar-button p-2 -ml-2 transition-all">
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
                {new Date($selectedPost.created_at).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>

          <div class="post-detail-content-panel mb-8 rounded-[32px] px-5 py-6 sm:px-6 sm:py-7">
            <p class="whitespace-pre-wrap text-xl font-medium leading-relaxed">
              {$selectedPost.content}
            </p>
          </div>

          {#if media.length > 0}
            <div class="mb-12 space-y-4">
              {#each media as item, i}
                <div class="post-detail-media-frame min-h-[220px] overflow-hidden rounded-3xl">
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

          <div bind:this={commentSectionEl} class="post-detail-comments border-t border-white/10 pt-10 pb-40 sm:pt-12 sm:pb-32">
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
            {:else if comments.length > 0}
              <div class="space-y-4 sm:space-y-5">
                {#each comments as comment}
                  <div class="post-detail-comment-row flex gap-4 rounded-[24px] px-3 py-3 sm:px-4" in:fade>
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

      <div class="post-detail-composer-wrap fixed bottom-0 left-0 right-0 p-4 sm:p-6">
        <div class="post-detail-composer mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <input
            bind:this={commentInputEl}
            type="text"
            bind:value={newComment}
            placeholder="想回一句什么，就写在这里。"
            class="post-detail-composer-input min-w-0 flex-1 rounded-2xl px-5 py-4 font-bold text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 outline-none transition-all"
            on:keydown={(e) => e.key === 'Enter' && handleComment()}
          />
          <button
            on:click={handleComment}
            aria-label="发布评论"
            disabled={submitting || !newComment.trim()}
            class="post-detail-composer-submit inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-5 text-[var(--color-bg,#231b22)] transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            <span class="text-xs font-black uppercase tracking-[0.18em]">{submitting ? '发布中…' : '发布评论'}</span>
          </button>
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
    background:
      radial-gradient(circle at top, rgba(var(--glow-primary-rgb), 0.12), transparent 40%),
      linear-gradient(180deg, rgba(12, 10, 13, 0.36), rgba(12, 10, 13, 0.58));
    backdrop-filter: blur(16px);
  }

  .post-detail-shell {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    border-radius: 2rem;
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.08)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.2)),
      rgba(var(--color-bg-rgb), 0.82);
    box-shadow:
      0 28px 80px rgba(var(--shadow-rgb), 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(22px) saturate(1.04);
  }

  .post-detail-header {
    border-bottom: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
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
  .post-detail-content-panel,
  .post-detail-media-frame,
  .post-detail-comment-row,
  .post-detail-composer,
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

  .post-detail-composer-wrap {
    pointer-events: none;
    background: linear-gradient(180deg, rgba(var(--color-bg-rgb), 0) 0%, rgba(var(--color-bg-rgb), 0.24) 26%, rgba(var(--color-bg-rgb), 0.42) 100%);
  }

  .post-detail-composer {
    pointer-events: auto;
  }

  @media (max-width: 639px) {
    .post-detail-frame {
      padding: 0;
    }

    .post-detail-shell {
      border-radius: 0;
    }
  }
</style>
