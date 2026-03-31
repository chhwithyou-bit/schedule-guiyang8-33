<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { gsap } from 'gsap';
  import { CustomEase } from 'gsap/dist/CustomEase';

  // Core parameter: Unique identifier to trigger the Key block refresh (e.g., currentView store)
  export let url: string;

  let container: HTMLElement;
  let layers: HTMLElement[] = [];
  let isInitialLoad = true;

  // Accessibility and performance check
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  if (typeof window !== 'undefined') {
    gsap.registerPlugin(CustomEase);
    // Create cinematic easing curve
    CustomEase.create("expoInOut", "M0,0 C0.76,0 0.24,1 1,1");
  }

  /**
   * Cinematic Svelte Transition Logic
   * Leveraging on:introstart and on:outrostart for precise GSAP control
   */
  const cinematicTransition = (node: HTMLElement) => {
    if (prefersReducedMotion) return { duration: 0 };
    return {
      duration: 1200, // Total sync duration for Svelte lifecycle
      tick: () => {} 
    };
  };

  /**
   * PHASE 1: OUTRO (The Sink)
   * Current page recedes into the background with blur
   */
  const runOutro = (node: HTMLElement) => {
    if (prefersReducedMotion || !node) return;
    
    gsap.to(node, {
      scale: 0.92,
      y: 30,
      opacity: 0,
      duration: 0.6,
      ease: 'power2.inOut',
      overwrite: true
    });
  };

  /**
   * PHASE 2 & 3: THE CURTAIN & INTRO (The Rise)
   * Staggered layers sweep in, then the new page floats up from "underwater"
   */
  const runIntro = (node: HTMLElement) => {
    if (prefersReducedMotion || !node) return;

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(node, { clearProps: "all" });
      }
    });

    // 1. Initial State: "Underwater" (Submerged)
    gsap.set(node, { 
      scale: 1.08, 
      opacity: 0, 
      y: -20,
      willChange: 'transform, opacity'
    });

    // 2. STAGGERED CURTAIN SWEEP (Inwards)
    tl.fromTo(layers, 
      { y: '100%' }, 
      { 
        y: '0%', 
        duration: 0.6, 
        stagger: 0.08, 
        ease: "expoInOut" 
      }
    );

    // 3. CURTAIN SWEEP (Outwards)
    tl.to(layers, {
      y: '-100%',
      duration: 0.6,
      stagger: 0.05,
      ease: "expoInOut",
      delay: 0.1
    }, "-=0.1");

    // 4. THE RISE: Float up to surface
    tl.to(node, {
      scale: 1,
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power3.out",
    }, "-=0.5"); 
  };

  onMount(() => {
    isInitialLoad = false;
  });
</script>

<div class="page-transition-wrapper">
  {#key url}
    <!-- Svelte Key block ensures DOM is re-rendered on url change, triggering transitions -->
    <div 
      class="content-container"
      in:cinematicTransition
      out:cinematicTransition
      on:introstart={(e) => runIntro(e.currentTarget)}
      on:outrostart={(e) => runOutro(e.currentTarget)}
    >
      <slot />
    </div>
  {/key}

  <!-- Cinematic Staggered Curtain Layers -->
  <div class="curtain-overlay" aria-hidden="true">
    <div bind:this={layers[0]} class="layer layer-secondary"></div>
    <div bind:this={layers[1]} class="layer layer-accent"></div>
    <div bind:this={layers[2]} class="layer layer-bg"></div>
  </div>
</div>

<style>
  .page-transition-wrapper {
    position: relative;
    width: 100%;
    min-height: 100vh;
    overflow-x: clip;
    overflow-y: visible;
  }

  .content-container {
    width: 100%;
    min-height: inherit;
    overflow: visible;
    will-change: transform, opacity;
    backface-visibility: hidden; /* Hardware acceleration */
  }

  .curtain-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none; /* Never intercept clicks */
  }

  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: translateY(100%);
    will-change: transform;
  }

  /* Layers Color Tokens matched to Theme System */
  .layer-secondary {
    background-color: var(--color-secondary, #6FC994);
    z-index: 1;
  }

  .layer-accent {
    background-color: var(--color-accent, #ff7710);
    z-index: 2;
  }

  .layer-bg {
    background-color: var(--color-bg, #fff);
    z-index: 3;
  }

  :global([data-theme="dark"]) .layer-bg {
    background-color: #050505; /* Deep black for dark transitions */
  }
</style>
