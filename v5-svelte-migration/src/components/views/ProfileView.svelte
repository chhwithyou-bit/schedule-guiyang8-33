<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { selectedProfile, isAuthenticated, user } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import PostCard from './PostCard.svelte';
  import { communityFetch } from '../../lib/communityApi';

  let posts: any[] = [];
  let loading = true;
  let isFollowing = false;
  let followerCount = 0;
  let followingCount = 0;

  $: if ($selectedProfile) {
    fetchProfileData();
    fetchUserPosts();
  }

  async function fetchProfileData() {
    if (!$selectedProfile) return;
    try {
      const res = await communityFetch(`/api/community/profile?id=${$selectedProfile.id || $selectedProfile.user_id}`);
      const data = await res.json();
      if (data.ok) {
        selectedProfile.set(data.user);
        isFollowing = data.user.viewer_is_following;
        followerCount = data.user.followers_count || 0;
        followingCount = data.user.following_count || 0;
      }
    } catch (e) {
      console.error('Failed to fetch profile', e);
    }
  }

  async function fetchUserPosts() {
    if (!$selectedProfile) return;
    loading = true;
    try {
      const res = await communityFetch(`/api/community/posts?userId=${$selectedProfile.id || $selectedProfile.user_id}`);
      const data = await res.json();
      if (data.ok) {
        posts = data.posts;
      }
    } catch (e) {
      console.error('Failed to fetch user posts', e);
    } finally {
      loading = false;
    }
  }

  async function toggleFollow() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    try {
      const res = await communityFetch('/api/community/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following_id: $selectedProfile.id || $selectedProfile.user_id })
      });
      const data = await res.json();
      if (data.ok) {
        isFollowing = data.action === 'followed';
        followerCount += isFollowing ? 1 : -1;
      }
    } catch (e) {
      console.error('Follow failed', e);
    }
  }

  function close() {
    selectedProfile.set(null);
  }
</script>

{#if $selectedProfile}
  <div 
    class="fixed inset-0 z-[7000] flex flex-col bg-[var(--color-bg)] overflow-hidden"
    transition:fly={{ y: 100, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <!-- Background Header -->
    <div class="relative h-64 md:h-80 flex-shrink-0">
      {#if $selectedProfile.background_url}
        <img src={$selectedProfile.background_url} alt="Background" class="w-full h-full object-cover" />
      {:else}
        <div class="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-800 dark:to-neutral-900 opacity-20"></div>
      {/if}
      
      <!-- Back Button -->
      <button 
        on:click={close}
        class="absolute top-6 left-6 p-3 rounded-full bg-black/20 backdrop-blur-xl text-white hover:scale-110 transition-transform"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      </button>

      <!-- Profile Header Overlay -->
      <div class="absolute -bottom-16 left-6 md:left-12 flex items-end gap-6">
        <div class="w-32 h-32 md:w-40 md:h-40 rounded-[48px] bg-white dark:bg-neutral-950 p-2 shadow-2xl overflow-hidden border-4 border-white dark:border-neutral-900">
          <div class="w-full h-full rounded-[40px] overflow-hidden bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
            {#if $selectedProfile.avatar_url}
              <img src={$selectedProfile.avatar_url} alt="Avatar" class="w-full h-full object-cover" />
            {:else}
              <span class="text-4xl font-black text-[var(--color-primary)]">
                {$selectedProfile.username?.slice(0, 1).toUpperCase()}
              </span>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto px-6 md:px-12 pt-20 pb-20">
      <div class="max-w-4xl mx-auto">
        <!-- Stats & Info -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h1 class="text-4xl font-black tracking-tighter uppercase">{$selectedProfile.username}</h1>
              {#if $selectedProfile.role === 'admin'}
                <span class="px-2 py-1 rounded-lg bg-[var(--color-primary)] text-[10px] text-white font-black uppercase tracking-widest">Admin</span>
              {/if}
            </div>
            <p class="text-sm font-bold opacity-30 uppercase tracking-[0.2em] mb-4">
              LV.{$selectedProfile.level || 1} · XP.{$selectedProfile.xp || 0}
            </p>
            <p class="text-base font-medium opacity-60 leading-relaxed max-w-xl">
              {$selectedProfile.signature || 'No frequency description available.'}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-6">
            <div class="text-center">
              <p class="text-2xl font-black tracking-tighter">{followingCount}</p>
              <p class="text-[10px] font-black opacity-30 uppercase tracking-widest">Following</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-black tracking-tighter">{followerCount}</p>
              <p class="text-[10px] font-black opacity-30 uppercase tracking-widest">Followers</p>
            </div>
            
            {#if $user && $user.id !== ($selectedProfile.id || $selectedProfile.user_id)}
              <button 
                on:click={toggleFollow}
                class="ml-4 px-8 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all
                       {isFollowing ? 'bg-neutral-100 dark:bg-neutral-900 opacity-60' : 'bg-[var(--color-primary)] text-white shadow-lg scale-105'}"
              >
                {isFollowing ? 'Unfollow' : 'Follow Flow'}
              </button>
            {/if}
          </div>
        </div>

        <!-- Post Feed -->
        <div class="space-y-8">
          <h3 class="text-xl font-black uppercase tracking-tighter border-b border-neutral-100 dark:border-neutral-900 pb-4 mb-8">
            Published Stories
            <span class="ml-2 text-sm opacity-30">({posts.length})</span>
          </h3>

          {#if loading}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#each Array(4) as _}
                <div class="h-64 rounded-[32px] bg-neutral-100 dark:bg-neutral-900 animate-pulse"></div>
              {/each}
            </div>
          {:else if posts.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#each posts as post (post.id)}
                <PostCard {post} />
              {/each}
            </div>
          {:else}
            <div class="py-24 text-center opacity-20 font-black uppercase tracking-widest text-sm">
              Silence is golden.
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
