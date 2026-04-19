<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { gsap } from 'gsap';

  export let url: string;

  let washLayer: HTMLElement;
  let isInitialLoad = true;
  let activeTimeline: gsap.core.Timeline | null = null;

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const smoothTransition = (_node: HTMLElement) => {
    if (prefersReducedMotion || isInitialLoad) return { duration: 0 };
    return {
      duration: 440,
      tick: () => {}
    };
  };

  const isVisibleElement = (node: Element) =>
    node instanceof HTMLElement &&
    node.dataset.motionSkip !== 'true' &&
    !node.hasAttribute('hidden');

  const collectMotionTargets = (node: HTMLElement) => {
    const directChildren = Array.from(node.children).filter(isVisibleElement) as HTMLElement[];

    if (directChildren.length === 1) {
      const nestedChildren = Array.from(directChildren[0].children).filter(isVisibleElement) as HTMLElement[];
      if (nestedChildren.length >= 2) {
        return nestedChildren.slice(0, 10);
      }
    }

    return directChildren.slice(0, 10);
  };

  const resetLayer = (node: HTMLElement, targets: HTMLElement[]) => {
    gsap.set([node, ...targets], { clearProps: 'transform,opacity,filter,willChange' });
    if (washLayer) {
      gsap.set(washLayer, { clearProps: 'transform,opacity,filter,willChange' });
    }
  };

  const stopActiveTimeline = () => {
    if (activeTimeline) {
      activeTimeline.kill();
      activeTimeline = null;
    }
  };

  const runOutro = (node: HTMLElement) => {
    if (prefersReducedMotion || isInitialLoad || !node) return;

    stopActiveTimeline();
    const targets = collectMotionTargets(node);

    gsap.killTweensOf([node, washLayer, ...targets]);
    gsap.set([node, ...targets], { willChange: 'transform, opacity, filter' });

    activeTimeline = gsap.timeline({
      defaults: { overwrite: true }
    });

    activeTimeline.to(
      targets,
      {
        y: -10,
        opacity: 0,
        filter: 'blur(7px)',
        duration: 0.16,
        stagger: 0.03,
        ease: 'power2.out'
      },
      0
    );

    activeTimeline.to(
      node,
      {
        y: 8,
        scale: 0.992,
        opacity: 0,
        filter: 'blur(7px)',
        duration: 0.2,
        ease: 'power2.out'
      },
      0
    );

    activeTimeline.to(
      washLayer,
      {
        opacity: 0.3,
        scaleY: 1,
        scaleX: 1,
        duration: 0.18,
        ease: 'power1.out',
        transformOrigin: 'top center'
      },
      0
    );

    activeTimeline.to(
      washLayer,
      {
        opacity: 0,
        duration: 0.22,
        ease: 'power2.out'
      },
      0.08
    );
  };

  const runIntro = (node: HTMLElement) => {
    if (!node || isInitialLoad) {
      isInitialLoad = false;
      return;
    }

    if (prefersReducedMotion) return;

    stopActiveTimeline();
    const targets = collectMotionTargets(node);

    gsap.killTweensOf([node, washLayer, ...targets]);
    gsap.set(node, {
      y: 18,
      scale: 0.992,
      opacity: 0,
      filter: 'blur(8px)',
      willChange: 'transform, opacity, filter'
    });
    gsap.set(targets, {
      y: 24,
      opacity: 0,
      filter: 'blur(10px)',
      willChange: 'transform, opacity, filter'
    });
    if (washLayer) {
      gsap.set(washLayer, {
        opacity: 0,
        scaleY: 0.9,
        scaleX: 0.985,
        willChange: 'transform, opacity, filter'
      });
    }

    activeTimeline = gsap.timeline({
      onComplete: () => {
        resetLayer(node, targets);
        activeTimeline = null;
      }
    });

    activeTimeline.fromTo(
      washLayer,
      { opacity: 0, scaleY: 0.9, scaleX: 0.985 },
      {
        opacity: 0.5,
        scaleY: 1,
        scaleX: 1,
        duration: 0.16,
        ease: 'power2.out',
        transformOrigin: 'top center'
      }
    );

    activeTimeline.to(
      washLayer,
      {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.out'
      },
      0.1
    );

    activeTimeline.to(
      node,
      {
        y: 0,
        scale: 1,
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.42,
        ease: 'power3.out'
      },
      0.02
    );

    activeTimeline.to(
      targets,
      {
        y: 0,
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.46,
        stagger: 0.05,
        ease: 'power3.out'
      },
      0.08
    );
  };

  onMount(() => {
    isInitialLoad = false;
  });

  onDestroy(() => {
    stopActiveTimeline();
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
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.04), rgba(var(--color-bg-rgb), 0.24) 54%, rgba(var(--color-bg-rgb), 0.08)),
      radial-gradient(circle at 50% 18%, rgba(var(--glow-primary-rgb), 0.16), transparent 34%),
      radial-gradient(circle at 18% 72%, rgba(var(--glow-secondary-rgb), 0.12), transparent 28%);
    filter: saturate(1.05);
  }
</style>
