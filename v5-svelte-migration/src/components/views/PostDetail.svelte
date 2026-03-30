<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { selectedPost, isAuthenticated, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';

  let comments: any[] = [];
  let loading = true;
  let newComment = '';
  let submitting = false;

  $: if ($selectedPost) {
    fetchComments();
  }

  function handleProfileClick(user: any) {
    selectedProfile.set({
      id: user.id || user.user_id,
      username: user.username,
      avatar_url: user.avatar_url,
      role: user.role
    });
  }

  async function fetchComments() {
    if (!$selectedPost) return;
    loading = true;
    try {
      const res = await fetch(`/api/community/comments?postId=${$selectedPost.id}`);
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
    if (!newComment.trim()) return;
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    submitting = true;
    try {
      const res = await fetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: $selectedPost.id,
          content: newComment
        })
      });
      const data = await res.json();
      if (data.ok) {
        newComment = '';
        await fetchComments();
        // Update local post comment count
        $selectedPost.comment_count = ($selectedPost.comment_count || 0) + 1;
      }
    } catch (e) {
      console.error('Failed to post comment', e);
    } finally {
      submitting = false;
    }
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
    <header class="flex items-center justify-between px-6 py-6 border-b border-neutral-100 dark:border-neutral-900">
      <button on:click={close} class="p-2 -ml-2 opacity-40 hover:opacity-100 transition-opacity">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      </button>
      <h2 class="text-xl font-black uppercase tracking-tighter">Story Flow</h2>
      <div class="w-10"></div>
    </header>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto px-6 py-8">
      <div class="max-w-3xl mx-auto">
        <!-- Post Header -->
        <div class="flex items-center gap-4 mb-8">
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div on:click={() => handleProfileClick($selectedPost)} class="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden border-2 border-[var(--color-primary)] cursor-pointer">
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
                <span class="px-1.5 py-0.5 rounded-md bg-[var(--color-primary)] text-[10px] text-white font-black uppercase tracking-widest">Admin</span>
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
        <div class="border-t border-neutral-100 dark:border-neutral-900 pt-12 pb-32">
          <h3 class="text-2xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3">
            Comments
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
              No resonance yet.
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Sticky Comment Input -->
    <div class="fixed bottom-0 left-0 right-0 p-6 bg-[var(--color-bg)]/80 backdrop-blur-2xl border-t border-neutral-100 dark:border-neutral-900">
      <div class="max-w-3xl mx-auto flex gap-4">
        <input 
          type="text" 
          bind:value={newComment}
          placeholder="Share your resonance..."
          class="flex-1 px-6 py-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-bold"
          on:keydown={(e) => e.key === 'Enter' && handleComment()}
        />
        <button 
          on:click={handleComment}
          disabled={submitting || !newComment.trim()}
          class="w-14 h-14 flex items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white hover:scale-110 active:scale-95 transition-all shadow-lg disabled:opacity-30 disabled:scale-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
  </div>
{/if}
