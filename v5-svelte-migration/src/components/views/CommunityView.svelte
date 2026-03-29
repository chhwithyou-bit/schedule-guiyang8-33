<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  
  let headlineRef: HTMLElement;
  let textRef: HTMLElement;
  
  onMount(() => {
    gsap.from([headlineRef, textRef], {
      y: 60,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out'
    });
  });
</script>

<div class="community-view">
  <h1 bind:this={headlineRef} class="text-[10vw] leading-none font-black tracking-tighter mb-8 uppercase">
    Community
  </h1>
  
  <p bind:this={textRef} class="text-xl max-w-2xl font-medium opacity-80 mb-12">
    The social hub. The previous `#comm-post-fab` has been gracefully migrated to the central Liquid Bar.
  </p>

  <div class="space-y-6">
    <!-- Preserved community posts rendering logic goes here -->
    {#each [1, 2, 3] as item}
      <article class="p-8 rounded-3xl bg-[var(--color-bg)] border-2 border-neutral-100 dark:border-neutral-800 shadow-sm hover:shadow-xl transition-shadow duration-300">
        <h2 class="text-2xl font-bold mb-4">Community Post {item}</h2>
        <p class="opacity-70">Preserved original content and API fetching will populate these articles.</p>
      </article>
    {/each}
  </div>
</div>
