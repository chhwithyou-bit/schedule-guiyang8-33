<script lang="ts">
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { gsap } from 'gsap';
  import { themeInitialized } from '../../stores/appState';

  const dispatch = createEventDispatcher();

  let progress = { value: 0 };
  let displayValue = '00';
  let container: HTMLElement;
  let veilRef: HTMLDivElement;
  let apertureRef: HTMLDivElement;
  let glowRef: HTMLDivElement;
  let numberContainer: HTMLElement;

  let counterTl: gsap.core.Timeline;
  let isFinishing = false;
  let mountedAt = 0;
  let isMounted = false;
  let completionTimer: ReturnType<typeof setTimeout> | null = null;

  const MIN_VISIBLE_MS = 920;

  onMount(() => {
    isMounted = true;
    mountedAt = performance.now();
    startInitialCounter();

    if ($themeInitialized && !isFinishing) {
      scheduleCompletion();
    }

    return () => {
      if (completionTimer) {
        clearTimeout(completionTimer);
      }
      if (counterTl) {
        try {
          counterTl.kill();
        } catch (e) {}
      }
    };
  });

  $: if (isMounted && $themeInitialized && !isFinishing) {
    scheduleCompletion();
  }

  function updateDisplay() {
    const val = Math.floor(progress.value);
    displayValue = val < 10 ? `0${val}` : `${val}`;
  }

  function startInitialCounter() {
    try {
      counterTl = gsap.timeline();

      counterTl.to(progress, {
        value: 78,
        duration: 0.55,
        ease: 'power2.out',
        onUpdate: updateDisplay
      });

      counterTl.to(progress, {
        value: 94,
        duration: 0.5,
        ease: 'sine.out',
        onUpdate: updateDisplay
      });

      counterTl.to(progress, {
        value: 99,
        duration: 0.78,
        ease: 'none',
        onUpdate: updateDisplay
      });

      if (veilRef) {
        counterTl.to(
          veilRef,
          {
            '--veil-shift': '1',
            duration: 1.83,
            ease: 'sine.inOut'
          },
          0
        );
      }
    } catch (e) {
      console.warn('Initial counter failed, skipping to completion check:', e);
      displayValue = '99';
    }
  }

  function scheduleCompletion() {
    if (completionTimer || isFinishing) return;

    const elapsed = performance.now() - mountedAt;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

    completionTimer = setTimeout(() => {
      completionTimer = null;
      completeLoading();
    }, delay);
  }

  async function completeLoading() {
    isFinishing = true;

    if (completionTimer) {
      clearTimeout(completionTimer);
      completionTimer = null;
    }

    if (counterTl) {
      try {
        counterTl.kill();
      } catch (e) {}
    }

    await tick();

    try {
      const tl = gsap.timeline({
        onComplete: () => {
          dispatch('complete');
        }
      });

      tl.to(progress, {
        value: 100,
        duration: 0.24,
        ease: 'power2.out',
        onUpdate: () => {
          displayValue = '100';
        }
      });

      tl.to(
        apertureRef,
        {
          scale: 1.48,
          opacity: 0.86,
          duration: 0.42,
          ease: 'power2.out'
        },
        0.04
      );

      tl.to(
        glowRef,
        {
          opacity: 0.88,
          duration: 0.22,
          ease: 'power1.out'
        },
        0.04
      );

      tl.to(
        numberContainer,
        {
          y: -14,
          opacity: 0,
          duration: 0.26,
          ease: 'power2.in'
        },
        0.12
      );

      tl.to(
        veilRef,
        {
          yPercent: -108,
          opacity: 0.86,
          duration: 0.82,
          ease: 'expo.inOut'
        },
        0.18
      );

      tl.to(
        container,
        {
          opacity: 0,
          duration: 0.38,
          ease: 'power2.out'
        },
        0.62
      );
    } catch (e) {
      console.error('Preloader completion animation failed:', e);
      dispatch('complete');
    }
  }
</script>

<div bind:this={container} class="preloader-overlay">
  <div bind:this={glowRef} class="preloader-glow"></div>
  <div bind:this={veilRef} class="preloader-veil"></div>
  <div bind:this={apertureRef} class="preloader-aperture"></div>

  <div class="preloader-center">
    <p class="preloader-kicker">opening sequence</p>

    <div bind:this={numberContainer} class="counter-container">
      <div class="digit-display font-mono">
        {displayValue}<span class="unit">%</span>
      </div>
      <p class="preloader-note">liquid veil lifting</p>
    </div>

    <div class="preloader-progress" aria-hidden="true">
      <span style={`transform: scaleX(${Math.min(progress.value, 100) / 100})`}></span>
    </div>
  </div>
</div>

<style>
  .preloader-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      radial-gradient(circle at 18% 16%, rgba(var(--glow-primary-rgb), 0.12), transparent 28%),
      radial-gradient(circle at 82% 14%, rgba(var(--glow-secondary-rgb), 0.14), transparent 30%),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.98), rgba(var(--color-bg-rgb), 0.94));
    color: var(--color-text);
    opacity: 1;
    will-change: opacity;
  }

  .preloader-glow,
  .preloader-veil,
  .preloader-aperture {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .preloader-glow {
    opacity: 0.42;
    background:
      radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.18), transparent 18%),
      radial-gradient(circle at 50% 54%, rgba(var(--glow-primary-rgb), 0.16), transparent 32%);
    filter: blur(12px);
  }

  .preloader-veil {
    --veil-shift: 0;
    inset: -12% -10% 0;
    background:
      radial-gradient(circle at calc(48% + (var(--veil-shift) * 7%)) 28%, rgba(255, 255, 255, 0.22), transparent 18%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05) 34%, rgba(var(--color-bg-rgb), 0.08) 68%, rgba(var(--color-bg-rgb), 0.46) 100%),
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.09));
    transform: translate3d(0, 0, 0);
  }

  .preloader-veil::after {
    content: '';
    position: absolute;
    inset: auto 0 18%;
    height: min(20rem, 24vh);
    background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.16), transparent 72%);
    opacity: 0.55;
    filter: blur(20px);
  }

  .preloader-aperture {
    inset: 50% auto auto 50%;
    width: min(34rem, 78vw);
    height: min(34rem, 78vw);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background:
      radial-gradient(circle, rgba(255, 255, 255, 0.1), transparent 62%),
      rgba(255, 255, 255, 0.02);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 0 0 1px rgba(var(--glow-primary-rgb), 0.08);
    opacity: 0.24;
    transform: translate(-50%, -50%) scale(0.76);
    transform-origin: center;
  }

  .preloader-center {
    position: relative;
    z-index: 1;
    display: flex;
    width: min(28rem, calc(100vw - 3rem));
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
  }

  .preloader-kicker {
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    opacity: 0.46;
  }

  .counter-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
  }

  .digit-display {
    font-size: clamp(5.25rem, 16vw, 9.6rem);
    font-weight: 900;
    letter-spacing: -0.08em;
    line-height: 0.82;
    color: rgba(255, 255, 255, 0.94);
    text-shadow: 0 14px 34px rgba(var(--shadow-rgb), 0.16);
  }

  .unit {
    margin-left: 0.45rem;
    font-size: 0.24em;
    font-weight: 700;
    letter-spacing: -0.01em;
    opacity: 0.34;
  }

  .preloader-note {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.5;
  }

  .preloader-progress {
    width: min(15rem, 58vw);
    height: 0.24rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .preloader-progress span {
    display: block;
    height: 100%;
    width: 100%;
    border-radius: inherit;
    transform-origin: left center;
    background: linear-gradient(90deg, rgba(var(--glow-primary-rgb), 0.92), rgba(255, 255, 255, 0.95));
    box-shadow: 0 0 18px rgba(var(--glow-primary-rgb), 0.18);
  }

  @media (max-width: 768px) {
    .preloader-center {
      width: min(22rem, calc(100vw - 2rem));
    }

    .preloader-aperture {
      width: min(22rem, 88vw);
      height: min(22rem, 88vw);
    }

    .preloader-note {
      font-size: 0.64rem;
    }
  }
</style>
