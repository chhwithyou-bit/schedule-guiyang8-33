<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';

  let cursorRef: HTMLElement;
  let followerRef: HTMLElement;
  let isHovering = false;

  let mouseX = 0;
  let mouseY = 0;
  let cursorX = 0;
  let cursorY = 0;

  onMount(() => {
    // Hide native cursor if we want, but let's keep it minimal for now
    // document.body.style.cursor = 'none';

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'a' || target.tagName.toLowerCase() === 'button' || target.closest('button') || target.closest('a')) {
        isHovering = true;
      } else {
        isHovering = false;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseover', onMouseOver);

    const render = () => {
      // Lerp for smooth following
      cursorX += (mouseX - cursorX) * 0.12;
      cursorY += (mouseY - cursorY) * 0.12;

      if (cursorRef) {
        gsap.set(cursorRef, { x: mouseX, y: mouseY });
      }
      if (followerRef) {
        gsap.set(followerRef, { x: cursorX, y: cursorY });
      }

      requestAnimationFrame(render);
    };
    
    requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseover', onMouseOver);
      // document.body.style.cursor = 'auto';
    };
  });
</script>

<!-- The exact mouse position dot -->
<div 
  bind:this={cursorRef} 
  class="fixed top-0 left-0 w-2 h-2 -ml-1 -mt-1 bg-[var(--color-primary)] rounded-full pointer-events-none z-[9999] mix-blend-difference"
></div>

<!-- The smooth following larger circle that scales on hover -->
<div 
  bind:this={followerRef}
  class="fixed top-0 left-0 w-8 h-8 -ml-4 -mt-4 border border-[var(--color-primary)] rounded-full pointer-events-none z-[9998] transition-transform duration-300 ease-out"
  class:scale-[2.5]={isHovering}
  class:bg-[var(--color-primary)]={isHovering}
  class:opacity-50={isHovering}
></div>

<style>
  /* Ensure it doesn't show on touch devices */
  @media (hover: none) and (pointer: coarse) {
    div {
      display: none;
    }
  }
</style>
