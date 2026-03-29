<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { spring } from 'svelte/motion';
  import gsap from 'gsap';

  export let currentRoute = 'schedule';

  const dispatch = createEventDispatcher();
  let hubRef;
  let expanded = false;

  // Spring physics for the hub expansion
  const yOffset = spring(0, {
    stiffness: 0.1,
    damping: 0.8
  });

  const menuItems = [
    { id: 'schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'community', label: 'Community', icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z' },
    { id: 'nodes', label: 'Nodes', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { id: 'xiangqi', label: 'Xiangqi', icon: 'M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5' }
  ];

  function toggleHub() {
    expanded = !expanded;
    // Animate menu items stagger
    if (expanded) {
      gsap.fromTo('.hub-item',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'back.out(1.7)' }
      );
    }
  }

  function handleNavigate(routeId) {
    if (currentRoute === routeId) return;
    dispatch('navigate', { route: routeId });
    // Collapse after selection on mobile
    if (window.innerWidth < 768) {
      expanded = false;
    }
  }

  // Handle Drag logic with enlarged hit area (svelte actions could also be used here)
  let startY = 0;
  function handleTouchStart(e) {
    startY = e.touches[0].clientY;
  }
  function handleTouchMove(e) {
    const deltaY = e.touches[0].clientY - startY;
    // Simple drag resistance
    if (deltaY > 0 && expanded) {
      $yOffset = deltaY * 0.5;
    } else if (deltaY < 0 && !expanded) {
      $yOffset = deltaY * 0.5;
    }
  }
  function handleTouchEnd() {
    if ($yOffset > 50 && expanded) {
      expanded = false;
    } else if ($yOffset < -50 && !expanded) {
      expanded = true;
    }
    yOffset.set(0); // Snap back to physics rest
  }

</script>

<!--
  Unified Navigation Hub (Replaces Drawer and Floating Action Button)
  Sits inside the Z-Axis constraints defined in App.svelte
-->
<nav
  bind:this={hubRef}
  class="relative w-[90%] md:w-full max-w-md mx-auto bg-[var(--color-bg)] text-[var(--color-text)] rounded-t-3xl shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] border-t border-gray-100 dark:border-gray-800"
  class:translate-y-[calc(100%-4rem)]={!expanded}
  style="transform: translateY(calc({expanded ? '0%' : '100%'} - {expanded ? 0 : 4}rem + {$yOffset}px));"
>
  <!-- Drag Handle / Tap Target (Enlarged Hit Area) -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="w-full py-6 flex flex-col items-center justify-center cursor-pointer touch-none"
    on:click={toggleHub}
    on:touchstart={handleTouchStart}
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}
  >
    <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full transition-all duration-300"
         class:w-8={expanded}></div>
  </div>

  <!-- Hub Content -->
  <div class="px-6 pb-8 pt-2 grid grid-cols-4 gap-4 md:gap-8">
    {#each menuItems as item}
      <button
        class="hub-item flex flex-col items-center gap-2 group relative"
        on:click={() => handleNavigate(item.id)}
      >
        <!-- Icon Circle -->
        <div
          class="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
          class:bg-[var(--color-primary)]={currentRoute === item.id}
          class:text-white={currentRoute === item.id}
          class:bg-gray-100={currentRoute !== item.id}
          class:dark:bg-gray-800={currentRoute !== item.id}
          class:group-hover:scale-110={true}
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
          </svg>
        </div>

        <!-- Label -->
        <span
          class="text-xs font-medium transition-colors"
          class:text-[var(--color-primary)]={currentRoute === item.id}
          class:text-gray-500={currentRoute !== item.id}
        >
          {item.label}
        </span>

        <!-- Active Dot -->
        {#if currentRoute === item.id}
          <div class="absolute -bottom-2 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]"></div>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Consolidate the Floating Action Button here (e.g., Post creation in Community) -->
  {#if currentRoute === 'community'}
    <div class="px-6 pb-6">
      <button
        class="w-full py-4 rounded-xl bg-[var(--color-primary)] text-white font-bold tracking-wide shadow-lg transform transition active:scale-95 hover:brightness-110"
        on:click={() => dispatch('action', { type: 'new_post' })}
      >
        CREATE POST
      </button>
    </div>
  {/if}
</nav>

<style>
  /* Additional scoped styles if needed */
</style>
