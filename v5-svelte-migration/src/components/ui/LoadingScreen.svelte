<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';

  let overlayRef: HTMLElement;
  let textRef: HTMLElement;
  let pathRef: SVGPathElement;

  onMount(() => {
    // 1. Text Pulse / Blink effect setup via CSS
    
    // 2. SVG Snake Path Animation
    const pathLength = pathRef.getTotalLength();
    gsap.set(pathRef, { strokeDasharray: pathLength, strokeDashoffset: pathLength });
    
    const tl = gsap.timeline({
      onComplete: () => {
        // Exit Animation
        gsap.to(textRef, { opacity: 0, duration: 0.8, ease: 'power2.inOut' });
        gsap.to(overlayRef, {
          y: '-100%',
          duration: 0.6,
          ease: 'customEase', // Or fallback to cubic-bezier in Svelte logic if CustomEase not loaded
          delay: 0.4
        });
      }
    });

    // Draw the line over 1.5 seconds
    tl.to(pathRef, {
      strokeDashoffset: 0,
      duration: 1.5,
      ease: 'power3.inOut'
    });
  });
</script>

<!-- The pure black full-screen overlay -->
<div 
  bind:this={overlayRef}
  class="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center pointer-events-none"
  style="transition: transform 0.6s cubic-bezier(0.76, 0, 0.24, 1);"
>
  
  <div class="relative w-64 h-64 flex items-center justify-center">
    <!-- SVG Snake Path -->
    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none">
      <path 
        bind:this={pathRef}
        d="M 10 50 Q 25 10, 50 50 T 90 50" 
        stroke="var(--color-primary, #fff)" 
        stroke-width="2" 
        stroke-linecap="round"
        class="opacity-80"
      />
    </svg>

    <!-- Center pulse text -->
    <div bind:this={textRef} class="text-white text-2xl font-black tracking-widest uppercase animate-pulse">
      LOADING<span class="animate-bounce">...</span>
    </div>
  </div>

</div>
