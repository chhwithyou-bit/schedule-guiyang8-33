<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { tick } from 'svelte';
  import { selectedPost, isAuthenticated, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';

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
    loading = true;
    try {
      const res = await communityFetch(`/api/community/comments?postId=${$selectedPost.id}`);
      const data = await res.json();
      if (data.ok) {
        comments = data.comments;
      }
    } catch (e) {
      console.error('Failed to fetch comments', e);
    } finally {
      loading = false;
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
        newComment = '';
        await fetchComments();
        selectedPost.update((current) => current
          ? {
              ...current,
              comment_count: (current.comment_count || 0) + 1,
              __focusComments: true,
              __openReportComposer: false
            }
          : current
        );
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
    } catch { return []; }
  }

  const media = $selectedPost ? safeJsonArray($selectedPost.media_json).filter(m => m && m.url) : [];
</script>

{#if $selectedPost}
  <div 
    class="fixed inset-0 z-[6000] flex flex-col bg-[var(--color-bg)]"
    transition:fly={{ x: 100, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <!-- Header -->
    <header class="flex items-center justify-between gap-4 border-b border-neutral-100 px-4 py-4 dark:border-neutral-900 sm:px-6 sm:py-6">
      <button on:click={close} aria-label="返回动态列表" class="p-2 -ml-2 opacity-40 hover:opacity-100 transition-opacity">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      </button>
      <h2 class="text-center text-base font-black uppercase tracking-tighter sm:text-xl">这条内容</h2>
      <button
        type="button"
        aria-label="打开举报面板"
        class="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] opacity-80 transition-transform hover:scale-105 sm:px-4"
        on:click={toggleReportComposer}
      >
        举报
      </button>
    </header>

    <!-- Scrollable Content -->
    <div bind:this={detailScrollEl} class="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div class="max-w-3xl mx-auto">
        {#if reportComposerOpen}
          <section class="mb-8 rounded-[28px] border border-red-400/20 bg-red-500/10 p-4 shadow-xl sm:p-5">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-100/60">举报内容</p>
                <h3 class="mt-2 text-xl font-black tracking-tight">把问题写清楚，我们会跟进处理。</h3>
              </div>
              <button
                type="button"
                aria-label="收起举报面板"
                class="rounded-full border border-red-300/15 bg-red-950/20 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-100/80 transition-transform hover:scale-105"
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
              class="mt-4 w-full rounded-[22px] border border-red-300/15 bg-black/10 px-4 py-3 text-sm font-medium leading-7 outline-none transition-colors focus:border-red-200/35"
            ></textarea>

            <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-xs font-bold text-red-100/70">举报会附上当前帖子 id 和你的账号信息。</p>
              <button
                type="button"
                aria-label="提交举报"
                class="inline-flex items-center justify-center rounded-full bg-red-100 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-950 transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                on:click={submitReport}
                disabled={reporting || !reportReason.trim()}
              >
                {reporting ? '正在提交…' : '提交举报'}
              </button>
            </div>
          </section>
        {/if}

        {#if reportMessage}
          <p class="mb-6 rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold opacity-80">{reportMessage}</p>
        {/if}

        <!-- Post Header -->
        <div class="mb-8 flex items-center gap-4">
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div on:click={() => handleProfileClick($selectedPost)} class="h-14 w-14 cursor-pointer overflow-hidden rounded-full border-2 border-[var(--color-primary)] bg-neutral-100 dark:bg-neutral-900">
            {#if $selectedPost.avatar_url}
              <img src={$selectedPost.avatar_url} alt={$selectedPost.username} class="w-full h-full object-cover" />
            {:else}
              <div class="w-full h-full flex items-center justify-center font-bold text-xl text-[var(--color-primary)]">
                {$selectedPost.username?.slice(0, 1).toUpperCase() || '?'}
              </div>
            {/if}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <span on:click={() => handleProfileClick($selectedPost)} class="font-black text-lg tracking-tight cursor-pointer hover:text-[var(--color-primary)] transition-colors">{$selectedPost.username}</span>
              {#if $selectedPost.role === 'admin'}
                <span class="px-1.5 py-0.5 rounded-md bg-[var(--color-primary)] text-[10px] text-white font-black uppercase tracking-widest">管理员</span>
              {/if}
            </div>
            <p class="text-xs font-bold opacity-30 uppercase tracking-widest">
              {new Date($selectedPost.created_at).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>

        <!-- Post Body -->
        <div class="mb-8">
          <p class="text-xl leading-relaxed font-medium whitespace-pre-wrap">
            {$selectedPost.content}
          </p>
        </div>

        <!-- Media Grid -->
        {#if media.length > 0}
          <div class="space-y-4 mb-12">
            {#each media as item}
              <div class="rounded-3xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-900">
                <img src={item.url} alt="Content" class="w-full h-auto" />
              </div>
            {/each}
          </div>
        {/if}

        <!-- Comments Section -->
        <div bind:this={commentSectionEl} class="border-t border-neutral-100 pt-10 pb-40 dark:border-neutral-900 sm:pt-12 sm:pb-32">
          <h3 class="text-2xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3">
            留言
            <span class="text-sm opacity-30 font-bold">({$selectedPost.comment_count || 0})</span>
          </h3>

          {#if loading}
            <div class="space-y-6">
              {#each Array(3) as _}
                <div class="flex gap-4 animate-pulse">
                  <div class="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-900"></div>
                  <div class="flex-1 space-y-2">
                    <div class="h-4 w-24 bg-neutral-100 dark:bg-neutral-900 rounded"></div>
                    <div class="h-12 w-full bg-neutral-100 dark:bg-neutral-900 rounded-xl"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if comments.length > 0}
            <div class="space-y-8">
              {#each comments as comment}
                <div class="flex gap-4" in:fade>
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div on:click={() => handleProfileClick(comment)} class="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden flex-shrink-0 cursor-pointer">
                    {#if comment.avatar_url}
                      <img src={comment.avatar_url} alt={comment.username} class="w-full h-full object-cover" />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center font-bold text-xs text-[var(--color-primary)]">
                        {comment.username?.slice(0, 1).toUpperCase() || '?'}
                      </div>
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <!-- svelte-ignore a11y-click-events-have-key-events -->
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <span on:click={() => handleProfileClick(comment)} class="font-bold text-sm tracking-tight cursor-pointer hover:text-[var(--color-primary)] transition-colors">{comment.username}</span>
                      <span class="text-[10px] font-bold opacity-30 uppercase tracking-widest">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <p class="text-sm font-medium leading-relaxed opacity-80 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="py-12 text-center opacity-20 font-black uppercase tracking-widest text-sm">
              还没人留言。
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Sticky Comment Input -->
    <div class="fixed bottom-0 left-0 right-0 border-t border-neutral-100 bg-[var(--color-bg)]/84 p-4 backdrop-blur-2xl dark:border-neutral-900 sm:p-6">
      <div class="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input 
          bind:this={commentInputEl}
          type="text" 
          bind:value={newComment}
          placeholder="想回一句什么，就写在这里。"
          class="min-w-0 flex-1 rounded-2xl bg-neutral-100 px-5 py-4 font-bold transition-all focus:ring-2 focus:ring-[var(--color-primary)] dark:bg-neutral-900"
          on:keydown={(e) => e.key === 'Enter' && handleComment()}
        />
        <button 
          on:click={handleComment}
          aria-label="发布评论"
          disabled={submitting || !newComment.trim()}
          class="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 text-[var(--color-bg)] shadow-lg transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          <span class="text-xs font-black uppercase tracking-[0.18em]">{submitting ? '发布中…' : '发布评论'}</span>
        </button>
      </div>
    </div>
  </div>
{/if}
