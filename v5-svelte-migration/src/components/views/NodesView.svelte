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

<div class="nodes-view">
  <h1 bind:this={headlineRef} class="text-[10vw] leading-none font-black tracking-tighter mb-8 uppercase">
    Nodes
  </h1>
  
  <p bind:this={textRef} class="text-xl max-w-2xl font-medium opacity-80">
    The central location for all your nodes and interconnected data. Preserved data logic lives here.
  </p>
  
  <div class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
    {#each [1, 2, 3, 4] as node}
      <div class="p-8 bg-neutral-50 dark:bg-neutral-900 rounded-3xl">
        <h3 class="text-xl font-bold mb-2">Node Item {node}</h3>
        <p class="opacity-70">Node description and preserved details.</p>
      </div>
    {/each}
  </div>
</div>
