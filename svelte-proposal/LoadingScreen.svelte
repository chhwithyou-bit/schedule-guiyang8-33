<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import gsap from 'gsap';

  const dispatch = createEventDispatcher();

  let containerRef;
  let logoRef;
  let textRef;
  let pathRef;

  const textString = "LOADING...";
  // Split text for staggered animation
  const characters = textString.split('');

  onMount(() => {
    // Determine if user has a theme saved. If yes, skip panel.
    const hasTheme = localStorage.getItem('siteTheme');

    // Create a master timeline
    const tl = gsap.timeline({
      onComplete: () => {
        if (hasTheme) {
          exitAnimation(false);
        } else {
          // Trigger Theme Selection Panel logic (mocked event payload here)
          exitAnimation(true);
        }
      }
    });

    // 1. Logo breathing pulse effect (scale oscillation)
    gsap.to(logoRef, {
      scale: 1.1,
      duration: 1.2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });

    // 2. Staggered character blink animation
    const chars = textRef.querySelectorAll('span');
    tl.fromTo(chars,
      { opacity: 0.2 },
      {
        opacity: 1,
        duration: 0.4,
        stagger: {
          each: 0.1,
          repeat: -1,
          yoyo: true
        },
        ease: "power1.inOut"
      },
      0
    );

    // 3. Draw SVG snake-path (stroke-dashoffset from 0 to 100%)
    const pathLength = pathRef.getTotalLength();
    gsap.set(pathRef, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength
    });

    tl.to(pathRef, {
      strokeDashoffset: 0,
      duration: 2.5,
      ease: "power2.inOut"
    }, 0); // Start at same time as text blink

  });

  function exitAnimation(showThemeSwitcher) {
    const exitTl = gsap.timeline({
      onComplete: () => dispatch('complete', { showThemeSwitcher })
    });

    // 1. Logo/text fades out over 0.8s
    exitTl.to([logoRef, textRef, pathRef], {
      opacity: 0,
      duration: 0.8,
      ease: "power2.inOut"
    });

    // 2. Overlay slides up: translateY(-100%), 600ms, custom cubic-bezier
    exitTl.to(containerRef, {
      yPercent: -100,
      duration: 0.6,
      ease: "custom", // GSAP CustomEase plugin should be registered globally for this
      // Fallback if CustomEase isn't registered: ease: "power4.inOut"
    }, "-=0.2");
  }
</script>

<!-- Full-screen pure black overlay, z-index: 9999 -->
<div
  bind:this={containerRef}
  class="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden"
>
  <!-- Background SVG Snake Path -->
  <div class="absolute inset-0 flex justify-center items-center pointer-events-none opacity-30">
    <svg
      width="100%" height="100%"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      class="w-full h-full max-w-4xl max-h-screen"
    >
      <path
        bind:this={pathRef}
        d="M 100,100 C 300,900 700,100 900,900"
        fill="none"
        stroke="var(--color-primary)"
        stroke-width="8"
        stroke-linecap="round"
      />
    </svg>
  </div>

  <!-- Brand Name / Logo -->
  <div
    bind:this={logoRef}
    class="text-[var(--color-primary)] text-6xl font-bold mb-8 z-10 tracking-tighter"
  >
    8COMMUNITY
  </div>

  <!-- Staggered Loading Text -->
  <div bind:this={textRef} class="text-white text-xl tracking-widest font-mono z-10">
    {#each characters as char}
      <span class="inline-block">
        {#if char === ' '}
          {@html '&nbsp;'}
        {:else}
          {char}
        {/if}
      </span>
    {/each}
  </div>
</div>

<style>
  /* Local overrides if needed, Tailwind handles most styling */
</style>
