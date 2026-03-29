<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let y = 0;
  let lastY = 0;
  let isVisible = true;

  onMount(() => {
    // Basic scroll hide/show logic
    window.addEventListener('scroll', () => {
      isVisible = y < lastY || y < 60;
      lastY = y;
    });
  });
</script>

<svelte:window bind:scrollY={y} />

<header 
  class="fixed top-0 left-0 right-0 z-[5000] px-6 md:px-12 py-6 transition-all duration-500
         {isVisible ? 'translate-y-0' : '-translate-y-full'}
         {y > 60 ? 'bg-white/80 dark:bg-neutral-950/80 backdrop-blur-2xl shadow-sm' : 'bg-transparent'}"
>
  <div class="max-w-7xl mx-auto flex items-center justify-between">
    <!-- Logo -->
    <div class="group cursor-pointer">
      <h1 class="text-2xl font-black tracking-tighter transition-transform group-hover:scale-110">
        8<span class="text-[var(--color-primary)]">COMMUNITY</span>
      </h1>
    </div>

    <!-- Navigation / Profile -->
    <div class="flex items-center gap-6">
      <button class="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:scale-110 transition-transform">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      </button>
    </div>
  </div>
</header>
