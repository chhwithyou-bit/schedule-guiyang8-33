<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';

  export let url: string;

  let washLayer: HTMLElement;
  let isInitialLoad = true;

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const smoothTransition = (_node: HTMLElement) => {
    if (prefersReducedMotion || isInitialLoad) return { duration: 0 };
    return {
      duration: 380,
      tick: () => {}
    };
  };

  const runOutro = (node: HTMLElement) => {
    if (prefersReducedMotion || isInitialLoad || !node) return;

    gsap.killTweensOf(node);
    gsap.to(node, {
      y: 10,
      opacity: 0,
      duration: 0.18,
      ease: 'power1.out',
      overwrite: true
    });
  };

  const runIntro = (node: HTMLElement) => {
    if (!node || isInitialLoad) {
      isInitialLoad = false;
      return;
    }

    if (prefersReducedMotion) return;

    gsap.killTweensOf([node, washLayer]);
    gsap.set(node, {
      y: 16,
      opacity: 0,
      filter: 'blur(8px)',
      willChange: 'transform, opacity, filter'
    });

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(node, { clearProps: 'all' });
        if (washLayer) {
          gsap.set(washLayer, { clearProps: 'all' });
        }
      }
    });

    tl.fromTo(
      washLayer,
      { opacity: 0, scaleY: 0.92 },
      {
        opacity: 0.8,
        scaleY: 1,
        duration: 0.16,
        ease: 'power1.out',
        transformOrigin: 'top center'
      }
    );

    tl.to(
      washLayer,
      {
        opacity: 0,
        duration: 0.26,
        ease: 'power2.out'
      },
      0.12
    );

    tl.to(
      node,
      {
        y: 0,
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.34,
        ease: 'power2.out'
      },
      0.02
    );
  };

  onMount(() => {
    isInitialLoad = false;
  });
</script>

<div class="page-transition-wrapper">
  {#key url}
    <div
      class="content-container"
      data-view-surface={url}
      in:smoothTransition
      out:smoothTransition
      on:introstart={(e) => runIntro(e.currentTarget)}
      on:outrostart={(e) => runOutro(e.currentTarget)}
    >
      <slot />
    </div>
  {/key}

  <div bind:this={washLayer} class="page-transition-wash" aria-hidden="true"></div>
</div>

<style>
  .page-transition-wrapper {
    position: relative;
    width: 100%;
    min-height: 100vh;
    overflow-x: clip;
    overflow-y: visible;
    isolation: isolate;
  }

  .content-container {
    position: relative;
    width: 100%;
    min-height: inherit;
    overflow: visible;
    backface-visibility: hidden;
    isolation: isolate;
  }

  .page-transition-wash {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    background:
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.08), rgba(var(--color-bg-rgb), 0.26) 54%, rgba(var(--color-bg-rgb), 0.08)),
      radial-gradient(circle at 50% 18%, rgba(var(--glow-primary-rgb), 0.1), transparent 34%);
  }
</style>
