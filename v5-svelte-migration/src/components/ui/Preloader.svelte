<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { gsap } from 'gsap';

  const dispatch = createEventDispatcher();
  let progress = { value: 0 };
  let displayValue = "00";
  let turbRef: SVGFETurbulenceElement;
  let dispRef: SVGFEDisplacementMapElement;
  let container: HTMLElement;
  let numberContainer: HTMLElement;

  import { themeInitialized } from '../../stores/appState';
  let isReadyToAnimate = false;

  import { tick } from 'svelte';

  $: if ($themeInitialized && !isReadyToAnimate) {
     isReadyToAnimate = true;
     tick().then(startAnimation);
  }

  onMount(() => {
    if ($themeInitialized && !isReadyToAnimate) {
       isReadyToAnimate = true;
       startAnimation();
    }
  });

  function startAnimation() {
    const tl = gsap.timeline({
      onComplete: () => {
        dispatch('complete');
      }
    });

    // 1. Loading Phase: Digital Scramble/Counter (0 to 99)
    tl.to(progress, {
      value: 99,
      duration: 2.0,
      ease: "power1.inOut",
      onUpdate: () => {
        const val = Math.floor(progress.value);
        displayValue = val < 10 ? `0${val}` : `${val}`;
      }
    });

    // 2. Reach 100%, hold for 200ms
    tl.to(progress, {
      value: 100,
      duration: 0.2,
      ease: "none",
      onUpdate: () => {
        displayValue = "100";
      }
    });

    tl.to({}, { duration: 0.2 }); // Hold for 200ms

    // 3. Liquid Burst Phase: Warping the space and vanishing number
    // We animate the baseFrequency and scale of the SVG filter

    // proxy object to cleanly animate two values for baseFrequency
    const freq = { valX: 0, valY: 0 };
    tl.to(freq, {
      valX: 0.04,
      valY: 0.01,
      duration: 0.8,
      ease: "power2.in",
      onUpdate: () => {
        turbRef.setAttribute("baseFrequency", `${freq.valX} ${freq.valY}`);
      }
    }, "burst");

    tl.to(dispRef, {
      attr: { scale: 180 },
      duration: 0.8,
      ease: "power2.in"
    }, "burst");

    tl.to(numberContainer, {
      scale: 0,
      opacity: 0,
      duration: 0.3,
      ease: "back.in(1.7)"
    }, "burst");

    // 4. Dissolve Phase
    tl.to(container, {
      opacity: 0,
      scale: 1.1,
      duration: 0.6,
      ease: "power3.inOut"
    }, "burst+=0.5");

    // Cleanup: Reset filter attributes to prevent performance drag after loading
    tl.set([turbRef, dispRef], { attr: { baseFrequency: "0", scale: "0" } });
  }
</script>

<div bind:this={container} class="preloader-overlay">
  <!-- Visual Center -->
  <div bind:this={numberContainer} class="counter-container">
    <div class="digit-glitch font-mono" data-text={displayValue}>
      {displayValue}<span class="unit">%</span>
    </div>
    <div class="liquid-aura"></div>
  </div>

  <!-- SVG Filter Magic: The engine of the Liquid Warp effect -->
  <svg class="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
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
    /* Apply the SVG displacement filter for the awakening warp */
    filter: url(#liquid-glass-awakening);
    will-change: filter, transform, opacity;
  }

  /* Subliminal noise texture for depth */
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
</style>
