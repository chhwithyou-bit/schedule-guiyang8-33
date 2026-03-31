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

  function handleProfileClick(e: MouseEvent) {
    e.stopPropagation();
    selectedProfile.set({
      id: post.user_id,
      username: post.username,
      avatar_url: post.avatar_url,
      role: post.role
    });
  }

  function handlePostClick() {
    selectedPost.set(post);
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

<article class="group relative bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 rounded-[32px] p-6 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-4">
    <button on:click={handleProfileClick} class="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden border border-white/10 shadow-sm flex-shrink-0">
      {#if post.avatar_url}
        <img src={post.avatar_url} alt={post.username} class="w-full h-full object-cover" />
      {:else}
        <div class="w-full h-full flex items-center justify-center font-bold text-sm text-[var(--color-primary)]">
          {post.username?.slice(0, 1).toUpperCase() || '?'}
        </div>
      {/if}
    </button>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="font-bold text-sm tracking-tight truncate">{post.username || 'Anonymous'}</span>
        {#if post.role === 'admin'}
          <span class="px-1.5 py-0.5 rounded-md bg-[var(--color-primary)] text-[9px] text-white font-black uppercase tracking-widest">Admin</span>
        {/if}
      </div>
      <p class="text-[10px] font-medium opacity-30 uppercase tracking-wider">{dateStr}</p>
    </div>
  </div>

  <!-- Content -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div on:click={handlePostClick} class="cursor-pointer mb-4">
    <p class="text-base leading-relaxed font-medium text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap line-clamp-6">
      {post.content}
    </p>
  </div>

  <!-- Media Grid -->
  {#if media.length > 0}
    <div class="grid gap-2 mb-6 rounded-2xl overflow-hidden {media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}">
      {#each media.slice(0, 4) as item, i}
        <div class="relative aspect-square bg-neutral-100 dark:bg-neutral-900">
          <img src={item.url} alt="Post media" class="w-full h-full object-cover" loading="lazy" />
          {#if i === 3 && media.length > 4}
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center text-white font-bold text-xl">
              +{media.length - 4}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Footer Actions -->
  <div class="flex items-center justify-between pt-4 border-t border-neutral-50 dark:border-neutral-900">
    <div class="flex items-center gap-4">
      <button 
        on:click={toggleLike}
        class="flex items-center gap-1.5 transition-all {liked ? 'text-red-500 scale-110' : 'opacity-40 hover:opacity-100'}"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <span class="text-xs font-black">{post.like_count || 0}</span>
      </button>
      
      <button on:click={handlePostClick} class="flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        <span class="text-xs font-black">{post.comment_count || 0}</span>
      </button>
    </div>

    <button class="opacity-10 hover:opacity-100 transition-opacity">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    </button>
  </div>
</article>
