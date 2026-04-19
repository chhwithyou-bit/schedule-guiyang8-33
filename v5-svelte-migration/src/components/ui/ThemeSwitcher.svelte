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

  // Particle Kinematics for "The Spark"
  class Particle {
    x: number; y: number; vx: number; vy: number;
    color: string; alpha: number; size: number; friction: number;

    constructor(x: number, y: number, color: string) {
      this.x = x; this.y = y;
      const angle = Math.random() * Math.PI * 2;
      const force = Math.random() * 8 + 4; 
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
      this.color = color;
      this.alpha = 1;
      this.size = Math.random() * 3 + 1.5;
      this.friction = 0.94; 
    }

    update() {
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.x += this.vx;
      this.y += this.vy;
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
    CustomEase.create("inkOut", "M0,0,C0.25,1,0.5,1,1,1");
    
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('request-theme-switch', handleGlobalRequest);

    const saved = localStorage.getItem('siteTheme');
    if (saved) {
      activeTheme.set(saved);
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
    }
  }

  export async function handleThemeSwitch(themeId: string, event?: MouseEvent | { clientX: number, clientY: number }) {
    const target = themes.find(t => t.id === themeId);
    if (!target) return;

    const originX = event ? event.clientX : window.innerWidth / 2;
    const originY = event ? event.clientY : window.innerHeight / 2;

    const distX = Math.max(originX, window.innerWidth - originX);
    const distY = Math.max(originY, window.innerHeight - originY);
    const radius = Math.hypot(distX, distY);

    particles = Array.from({ length: 40 }, () => new Particle(originX, originY, target.primary));
    cancelAnimationFrame(animationFrame);
    renderParticles();

    const tl = gsap.timeline();
    
    gsap.set(inkWashNode, {
      x: originX,
      y: originY,
      width: 0,
      height: 0,
      backgroundColor: target.bg,
      color: target.bg, 
      opacity: 1,
      scale: 0
    });

    tl.to(inkWashNode, {
      scale: (radius * 2) / 100, 
      duration: 0.7,
      ease: "inkOut"
    });

    tl.add(() => {
      activeTheme.set(target.id);
      localStorage.setItem('siteTheme', target.id);
      themeInitialized.set(true);
      showInitPanel = false;
    }, "-=0.1");

    tl.to(inkWashNode, {
      opacity: 0,
      duration: 0.5,
      ease: "power2.inOut",
      onComplete: () => { gsap.set(inkWashNode, { scale: 0 }); }
    });
  }
</script>

<canvas bind:this={canvas} class="fixed inset-0 z-[10001] pointer-events-none"></canvas>

<div 
  bind:this={inkWashNode} 
  class="fixed z-[10000] rounded-full pointer-events-none blur-edge"
  style="width: 100px; height: 100px; margin-left: -50px; margin-top: -50px;"
></div>

{#if showInitPanel}
  <div class="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 backdrop-blur-3xl overflow-hidden p-6">
    <div class="max-w-2xl w-full text-center">
      <h2 class="text-5xl font-black text-white mb-4 tracking-tighter uppercase leading-none">Pick Your Aura</h2>
      <p class="text-white/40 mb-12 font-medium tracking-widest uppercase text-[10px]">Select a visual frequency to begin.</p>
      
      <div class="grid grid-cols-2 gap-6">
        {#each themes as theme}
          <button 
            on:click={(e) => handleThemeSwitch(theme.id, e)}
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
  .blur-edge {
    box-shadow: 0 0 160px 80px currentColor; 
    filter: contrast(120%) brightness(1.05);
    will-change: transform, opacity;
  }

  h2 {
    font-family: 'Outfit', 'PingFang SC', sans-serif;
  }
</style>
