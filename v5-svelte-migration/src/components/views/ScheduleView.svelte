<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  
  // This view represents the core content of the existing Schedule section
  let headlineRef: HTMLElement;
  let textRef: HTMLElement;
  
  onMount(() => {
    // Basic GSAP stagger animation on mount
    gsap.from([headlineRef, textRef], {
      y: 60,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out'
    });
  });
</script>

<div class="schedule-view">
  <h1 bind:this={headlineRef} class="text-[10vw] leading-none font-black tracking-tighter mb-8 uppercase">
    Schedule
  </h1>
  
  <p bind:this={textRef} class="text-xl max-w-2xl font-medium opacity-80">
    This view contains the preserved logic, data fetching, and calendar rendering from the original schedule view.
  </p>
  
  <!-- Add preserved schedule logic here -->
  <div class="mt-12 h-96 bg-gray-100 rounded-3xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center">
    <span class="text-neutral-500 font-bold uppercase tracking-widest">Calendar Placeholder</span>
  </div>
</div>
