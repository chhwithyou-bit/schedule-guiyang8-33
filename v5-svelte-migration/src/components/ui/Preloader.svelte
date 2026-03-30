<script lang="ts">
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { gsap } from 'gsap';
  import { themeInitialized } from '../../stores/appState';

  const dispatch = createEventDispatcher();
  let progress = { value: 0 };
  let displayValue = "00";
  let turbRef: SVGFETurbulenceElement;
  let dispRef: SVGFEDisplacementMapElement;
  let container: HTMLElement;
  let numberContainer: HTMLElement;

  let counterTl: gsap.core.Timeline;
  let isFinishing = false;

  /**
   * REVOLUTIONARY LOADING STRATEGY
   * 1. Start counter immediately on mount to provide instant feedback.
   * 2. Slow down/wait at 99% if theme is not yet picked.
   * 3. Resume and burst once theme is confirmed.
   */
  
  onMount(() => {
    gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" });
    startInitialCounter();
  });

  $: if ($themeInitialized && !isFinishing) {
    completeLoading();
  }

  function startInitialCounter() {
    counterTl = gsap.timeline();

    // Fast climb to 60%
    counterTl.to(progress, {
      value: 60,
      duration: 0.8,
      ease: "power2.out",
      onUpdate: updateDisplay
    });

    // Slow crawl from 60 to 99%
    counterTl.to(progress, {
      value: 99,
      duration: 4.0,
      ease: "power1.inOut",
      onUpdate: updateDisplay
    });
  }

  function updateDisplay() {
    const val = Math.floor(progress.value);
    displayValue = val < 10 ? `0${val}` : `${val}`;
  }

  async function completeLoading() {
    isFinishing = true;
    
    // If the counter is still running, fast-forward it
    if (counterTl) {
      counterTl.kill();
    }

    await tick();

    const tl = gsap.timeline({
      onComplete: () => {
        dispatch('complete');
      }
    });

    // 1. Zoom to 100%
    tl.to(progress, {
      value: 100,
      duration: 0.3,
      ease: "power2.out",
      onUpdate: () => {
        displayValue = "100";
      }
    });

    tl.to({}, { duration: 0.2 }); // Hold

    // 2. Burst Phase
    // Defensive check for refs which might be missing in some edge cases
    if (turbRef && dispRef) {
      const freq = { valX: 0, valY: 0 };
      tl.to(freq, {
        valX: 0.04,
        valY: 0.01,
        duration: 0.8,
        ease: "power2.in",
        onUpdate: () => {
          if (turbRef) turbRef.setAttribute("baseFrequency", `${freq.valX} ${freq.valY}`);
        }
      }, "burst");

      tl.to(dispRef, {
        attr: { scale: 180 },
        duration: 0.8,
        ease: "power2.in"
      }, "burst");
    }

    tl.to(numberContainer, {
      scale: 0,
      opacity: 0,
      duration: 0.4,
      ease: "back.in(1.7)"
    }, "burst");

    // 3. Final Vanish
    tl.to(container, {
      opacity: 0,
      scale: 1.1,
      duration: 0.6,
      ease: "power3.inOut"
    }, "burst+=0.5");

    // Cleanup
    tl.add(() => {
      if (turbRef && dispRef) {
        gsap.set([turbRef, dispRef], { attr: { baseFrequency: "0", scale: "0" } });
      }
    });
  }
</script>

<svg class="fixed w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
  <filter id="liquid-glass-awakening">
    <feTurbulence 
      bind:this={turbRef}
      type="fractalNoise" 
      baseFrequency="0" 
      numOctaves="2" 
      result="noise" 
    />
    <feDisplacementMap 
      bind:this={dispRef}
      in="SourceGraphic" 
      in2="noise" 
      scale="0" 
      xChannelSelector="R" 
      yChannelSelector="G" 
    />
  </filter>
</svg>

<div bind:this={container} class="preloader-overlay">
  <div bind:this={numberContainer} class="counter-container">
    <div class="digit-glitch font-mono">
      {displayValue}<span class="unit">%</span>
    </div>
    <div class="liquid-aura"></div>
  </div>
</div>

<style>
  .preloader-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    background-color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    filter: url(#liquid-glass-awakening);
    will-change: filter, transform, opacity;
  }

  .preloader-overlay::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.05;
    pointer-events: none;
    mix-blend-mode: overlay;
  }

  .counter-container {
    position: relative;
    z-index: 10;
  }

  .digit-glitch {
    font-size: 16vw;
    font-weight: 900;
    color: var(--color-primary);
    letter-spacing: -0.06em;
    line-height: 0.8;
    text-shadow: 0 10px 30px rgba(0,0,0,0.1);
  }

  .unit {
    font-size: 4vw;
    opacity: 0.2;
    margin-left: 1vw;
    font-weight: 400;
  }

  .liquid-aura {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 40vw;
    height: 40vw;
    background: radial-gradient(circle, var(--color-primary) 0%, transparent 70%);
    transform: translate(-50%, -50%);
    opacity: 0.12;
    filter: blur(80px);
    animation: aura-pulse 5s ease-in-out infinite;
  }

  @keyframes aura-pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.1; }
    50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.22; }
  }

  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .digit-glitch {
      font-size: 25vw;
    }
    .unit {
      font-size: 8vw;
    }
    .liquid-aura {
      width: 60vw;
      height: 60vw;
    }
  }
</style>
