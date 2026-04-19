<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import PostCard from './PostCard.svelte';
  import { syncStatus } from '../../stores/appState';

  let posts: any[] = [];
  let loading = true;
  let query = '';

  onMount(async () => {
    await fetchPosts();
  });

  async function fetchPosts() {
    loading = true;
    try {
      let url = '/api/community/posts?';
      if (query) url += `q=${encodeURIComponent(query)}&`;
      
      const res = await fetch(url);
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
</script>

<div class="community-view">
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
    <AnimatedHeading text="Community Hub" className="text-[10vw] md:text-[8vw]" />
    
    <form on:submit={handleSearch} class="relative w-full md:max-w-xs">
      <input 
        type="text" 
        bind:value={query}
        placeholder="Search stories..."
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
      <div class="text-6xl mb-4">empty_state</div>
      <p class="text-xl font-bold opacity-30 uppercase tracking-widest">No stories found here.</p>
    </div>
  {/if}
</div>
