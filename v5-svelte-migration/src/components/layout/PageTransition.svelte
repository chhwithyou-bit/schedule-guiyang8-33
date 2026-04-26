<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { gsap } from 'gsap';

  export let url: string;

  let washLayer: HTMLElement;
  let isInitialLoad = true;
  let activeTimeline: gsap.core.Timeline | null = null;
  const MOTION_PROFILE = {
    hold: 680,
    intro: 0.68,
    introLong: 0.76,
    outro: 0.28,
    washIn: 0.24,
    washOut: 0.42,
    enterEase: 'expo.out',
    exitEase: 'power3.inOut'
  } as const;

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const smoothTransition = (_node: HTMLElement) => {
    if (prefersReducedMotion || isInitialLoad) return { duration: 0 };
    return {
      duration: MOTION_PROFILE.hold,
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
    gsap.set([node, ...targets], { willChange: 'transform, opacity, filter', force3D: true });

    activeTimeline = gsap.timeline({
      defaults: { overwrite: true }
    });

    activeTimeline.to(
      targets,
      {
        y: -6,
        opacity: 0,
        filter: 'blur(4px)',
        duration: 0.2,
        stagger: 0.024,
        ease: MOTION_PROFILE.exitEase
      },
      0
    );

    activeTimeline.to(
      node,
      {
        y: 6,
        scale: 0.996,
        opacity: 0,
        filter: 'blur(5px)',
        duration: MOTION_PROFILE.outro,
        ease: MOTION_PROFILE.exitEase
      },
      0
    );

    activeTimeline.to(
      washLayer,
      {
        opacity: 0.22,
        scaleY: 1,
        scaleX: 1,
        duration: MOTION_PROFILE.washIn,
        ease: 'power2.out',
        transformOrigin: 'top center'
      },
      0
    );

    activeTimeline.to(
      washLayer,
      {
        opacity: 0,
        duration: MOTION_PROFILE.washOut,
        ease: MOTION_PROFILE.enterEase
      },
      0.1
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
      y: 14,
      scale: 0.996,
      opacity: 0,
      filter: 'blur(6px)',
      willChange: 'transform, opacity, filter',
      force3D: true
    });
    gsap.set(targets, {
      y: 18,
      opacity: 0,
      filter: 'blur(7px)',
      willChange: 'transform, opacity, filter',
      force3D: true
    });
    if (washLayer) {
      gsap.set(washLayer, {
        opacity: 0,
        scaleY: 0.94,
        scaleX: 0.992,
        willChange: 'transform, opacity, filter',
        force3D: true
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
      { opacity: 0, scaleY: 0.94, scaleX: 0.992 },
      {
        opacity: 0.34,
        scaleY: 1,
        scaleX: 1,
        duration: MOTION_PROFILE.washIn,
        ease: MOTION_PROFILE.enterEase,
        transformOrigin: 'top center'
      }
    );

    activeTimeline.to(
      washLayer,
      {
        opacity: 0,
        duration: MOTION_PROFILE.washOut,
        ease: MOTION_PROFILE.enterEase
      },
      0.12
    );

    activeTimeline.to(
      node,
      {
        y: 0,
        scale: 1,
        opacity: 1,
        filter: 'blur(0px)',
        duration: MOTION_PROFILE.intro,
        ease: MOTION_PROFILE.enterEase
      },
      0.02
    );

    activeTimeline.to(
      targets,
      {
        y: 0,
        opacity: 1,
        filter: 'blur(0px)',
        duration: MOTION_PROFILE.introLong,
        stagger: 0.045,
        ease: MOTION_PROFILE.enterEase
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
      data-motion-role="page-transition"
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
