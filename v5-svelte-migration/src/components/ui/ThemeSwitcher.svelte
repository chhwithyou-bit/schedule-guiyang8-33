<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { gsap } from 'gsap';
  import { CustomEase } from 'gsap/dist/CustomEase';
  import { activeTheme } from '../../stores/theme';
  import { themeInitialized } from '../../stores/appState';

  /**
   * 🎨 Palette Definitions (The Color Palettes)
   * Oriental Aesthetics & Natural Healing Textures
   */
  const themes = [
    { id: 'theme-default', name: 'Cyber Dark', primary: '#f5efe0', bg: '#020029', accent: '#3a3d5e' },
    { id: 'theme-spring', name: 'Spring Bamboo', primary: '#85B581', bg: '#EAF4E8', accent: '#598F56' },
    { id: 'theme-summer', name: 'Summer Lilac', primary: '#B29BCE', bg: '#F4F1F9', accent: '#8E6FB8' },
    { id: 'theme-autumn', name: 'Autumn Maple', primary: '#D17F71', bg: '#F9EDE9', accent: '#B85343' }
  ];

  let showInitPanel = false;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let inkWashNode: HTMLElement;
  let particles: Particle[] = [];
  let animationFrame: number;

  /**
   * Particle Kinematics for "The Spark"
   * Explodes particles radially from a point.
   */
  class Particle {
    x: number; y: number; vx: number; vy: number;
    color: string; alpha: number; size: number; friction: number;

    constructor(x: number, y: number, color: string) {
      this.x = x; this.y = y;

      // Random direction (angle) in radians (0 to 2PI)
      const angle = Math.random() * Math.PI * 2;

      // Initial explosive force (velocity)
      const force = Math.random() * 8 + 4; 

      // Resolve velocity vector into X and Y components
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;

      this.color = color;
      this.alpha = 1;
      this.size = Math.random() * 3 + 1.5;

      // Friction coefficient to simulate air resistance, slowing down the particles over time
      this.friction = 0.94; 
    }

    update() {
      // Apply friction to velocities
      this.vx *= this.friction;
      this.vy *= this.friction;

      // Update position
      this.x += this.vx;
      this.y += this.vy;

      // Fade out effect
      this.alpha -= 0.015; 
    }

    draw(ctx: CanvasRenderingContext2D) {
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const handleGlobalRequest = (e: any) => {
    handleThemeSwitch(e.detail.id, { clientX: e.detail.x, clientY: e.detail.y } as MouseEvent);
  };

  onMount(() => {
    gsap.registerPlugin(CustomEase);
    CustomEase.create("custom", "M0,0,C0.25,1,0.5,1,1,1");
    
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('request-theme-switch', handleGlobalRequest);

    const saved = localStorage.getItem('siteTheme');
    if (saved) {
      activeTheme.set(saved);
      document.documentElement.setAttribute('data-theme', saved);
      themeInitialized.set(true);
    } else {
      showInitPanel = true;
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('request-theme-switch', handleGlobalRequest);
      cancelAnimationFrame(animationFrame);
    };
  });

  function resizeCanvas() {
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }

  function renderParticles() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.alpha > 0);
    particles.forEach(p => {
      p.update();
      p.draw(ctx);
    });
    if (particles.length > 0) {
      animationFrame = requestAnimationFrame(renderParticles);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Ensure cleared when done
    }
  }

  export async function handleThemeSwitch(themeId: string, event?: MouseEvent | { clientX: number, clientY: number }, isFromInitPanel = false) {
    const target = themes.find(t => t.id === themeId);
    if (!target) return;

    // Phase 1: The Spark
    let originX = event ? event.clientX : window.innerWidth / 2;
    let originY = event ? event.clientY : window.innerHeight / 2;

    if (isFromInitPanel && event && event instanceof MouseEvent) {
      const targetElement = event.currentTarget as HTMLElement;
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        originX = rect.left + rect.width / 2;
        originY = rect.top + rect.height / 2;
      }
    }

    /**
     * Calculate maximum diagonal distance from origin to viewport corners.
     * This determines the radius required for the ink wash circle to cover the entire screen.
     */
    const distX = Math.max(originX, window.innerWidth - originX);
    const distY = Math.max(originY, window.innerHeight - originY);
    // Pythagorean theorem to find the hypotenuse
    const radius = Math.hypot(distX, distY);

    // Burst 20-30 particles with the new theme's primary color
    const particleCount = Math.floor(Math.random() * 11) + 20; // 20 to 30
    particles = Array.from({ length: particleCount }, () => new Particle(originX, originY, target.primary));
    cancelAnimationFrame(animationFrame);
    renderParticles();

    // Phase 2: The Ink Wash
    const tl = gsap.timeline();
    
    // Set initial state of ink wash circle
    // Width and height are 100px. Scale will expand it.
    gsap.set(inkWashNode, {
      x: originX,
      y: originY,
      backgroundColor: target.bg,
      color: target.bg, 
      opacity: 1,
      scale: 0,
      display: 'block' // Show it
    });

    // Ink Wash expansion
    // To cover radius with a 100px circle (radius 50px), we scale by (radius * 2) / 100 = radius / 50
    const targetScale = radius / 50;

    tl.to(inkWashNode, {
      scale: targetScale,
      duration: 0.5,
      ease: "custom"
    }, 0); // Start immediately with particles

    // Phase 3: The Shift
    tl.add(() => {
      // Swap variables under the mask
      activeTheme.set(target.id);
      document.documentElement.setAttribute('data-theme', target.id);
      localStorage.setItem('siteTheme', target.id);
      themeInitialized.set(true);
      showInitPanel = false; // Hide init panel if it was showing
    }, 0.5); // After 500ms when screen is fully masked

    // Fade out mask over 300ms
    tl.to(inkWashNode, {
      opacity: 0,
      duration: 0.3,
      ease: "power2.inOut",
      onComplete: () => {
        // Reset scale and hide completely
        gsap.set(inkWashNode, { scale: 0, display: 'none' });
      }
    }, 0.6); // 100ms after the mask fully covers (500ms + 100ms)
  }
</script>

<!-- The Spark Canvas Engine -->
<canvas bind:this={canvas} class="fixed inset-0 z-[10005] pointer-events-none"></canvas>

<!-- The Ink Wash Mask -->
<div 
  bind:this={inkWashNode} 
  class="fixed top-0 left-0 z-[10004] rounded-full pointer-events-none blur-edge"
  style="width: 100px; height: 100px; margin-left: -50px; margin-top: -50px; display: none;"
></div>

<!-- Initial Access Palette Picker -->
{#if showInitPanel}
  <div class="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 backdrop-blur-3xl overflow-hidden p-6">
    <div class="max-w-2xl w-full text-center">
      <h2 class="text-5xl font-black text-white mb-4 tracking-tighter uppercase leading-none">Pick Your Aura</h2>
      <p class="text-white/40 mb-12 font-medium tracking-widest uppercase text-[10px]">Select a visual frequency to begin.</p>
      
      <div class="grid grid-cols-2 gap-6">
        {#each themes as theme}
          <button 
            on:click={(e) => handleThemeSwitch(theme.id, e, true)}
            class="group relative aspect-video rounded-[40px] overflow-hidden border border-white/5 transition-all duration-500 hover:scale-[1.03] hover:border-white/20 active:scale-95"
          >
            <div class="absolute inset-0 transition-transform duration-1000 group-hover:scale-110" style="background-color: {theme.bg};"></div>
            <div class="relative h-full flex flex-col items-center justify-center">
              <div class="w-14 h-14 rounded-full shadow-2xl mb-4 transition-transform duration-500 group-hover:translate-y-[-8px]" style="background-color: {theme.primary}; border: 4px solid {theme.accent};"></div>
              <span class="text-[10px] font-black uppercase tracking-widest" style="color: {theme.primary};">{theme.name}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  /*
   * Feathering effect for the Ink Wash
   * Creates a massive box-shadow of the current currentColor (target.bg)
   * which gives a fuzzy "water spread" edge instead of a hard geometry.
   */
  .blur-edge {
    box-shadow: 0 0 160px 80px currentColor; 
    filter: contrast(120%) brightness(1.05);
    will-change: transform, opacity;
  }

  h2 {
    font-family: 'Outfit', 'PingFang SC', sans-serif;
  }
</style>
