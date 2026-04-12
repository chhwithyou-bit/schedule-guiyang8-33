<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { CustomEase } from 'gsap/dist/CustomEase';
  import { DEFAULT_THEME_ID, applyTheme, themeCatalog } from '../../stores/theme';
  import { themeInitialized } from '../../stores/appState';

  const themes = themeCatalog;

  let showInitPanel = false;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let inkWashNode: HTMLElement;
  let particles: Particle[] = [];
  let animationFrame: number;
  let activeThemeSwitch: Promise<void> | null = null;
  let queuedThemeSwitch: { themeId: string; event?: MouseEvent | { clientX: number, clientY: number }; isFromInitPanel: boolean } | null = null;

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
    try {
      gsap.registerPlugin(CustomEase);
      CustomEase.create("custom", "M0,0,C0.25,1,0.5,1,1,1");
    } catch (e) {
      console.warn('GSAP CustomEase registration failed, using fallback ease', e);
    }
    
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('request-theme-switch', handleGlobalRequest);

    try {
      const saved = localStorage.getItem('siteTheme');
      if (saved) {
        applyTheme(saved);
        themeInitialized.set(true);
      } else {
        applyTheme(DEFAULT_THEME_ID);
        showInitPanel = true;
      }
    } catch (e) {
      console.error('LocalStorage access failed:', e);
      applyTheme(DEFAULT_THEME_ID);
      showInitPanel = true; // Fallback to show picker if possible
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

  function finalizeThemeSwitch() {
    cancelAnimationFrame(animationFrame);
    particles = [];
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (inkWashNode) {
      gsap.killTweensOf(inkWashNode);
      gsap.set(inkWashNode, { clearProps: 'all' });
      inkWashNode.style.display = 'none';
    }
  }

  function getQueuedThemeSwitch() {
    const next = queuedThemeSwitch;
    queuedThemeSwitch = null;
    return next;
  }

  export async function handleThemeSwitch(themeId: string, event?: MouseEvent | { clientX: number, clientY: number }, isFromInitPanel = false) {
    const target = themes.find(t => t.id === themeId);
    if (!target) return;

    if (activeThemeSwitch) {
      queuedThemeSwitch = { themeId, event, isFromInitPanel };
      return activeThemeSwitch;
    }

    const savedThemeId = typeof localStorage !== 'undefined' ? localStorage.getItem('siteTheme') : null;
    if (target.id === savedThemeId && !showInitPanel) {
      themeInitialized.set(true);
      return;
    }

    activeThemeSwitch = new Promise<void>((resolve) => {
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
      const tl = gsap.timeline({
        onComplete: () => {
          finalizeThemeSwitch();
          activeThemeSwitch = null;
          const next = getQueuedThemeSwitch();
          resolve();
          if (next) {
            void handleThemeSwitch(next.themeId, next.event, next.isFromInitPanel);
          }
        }
      });

      inkWashNode.style.display = 'block';

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
        ease: 'custom'
      }, 0); // Start immediately with particles

      // Phase 3: The Shift
      tl.add(() => {
        applyTheme(target.id);
        localStorage.setItem('siteTheme', target.id);

        if (showInitPanel) {
          showInitPanel = false;
          // Ensure Preloader components and App components have a chance to sync
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              themeInitialized.set(true);
            });
          });
        } else {
          themeInitialized.set(true);
        }
      }, 0.5); // After 500ms when screen is fully masked

      // Fade out mask over 300ms
      tl.to(inkWashNode, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.inOut'
      }, 0.6); // 100ms after the mask fully covers (500ms + 100ms)
    });

    return activeThemeSwitch;
  }
</script>

<!-- The Spark Canvas Engine -->
<canvas bind:this={canvas} class="fixed inset-0 z-[1000012] pointer-events-none"></canvas>

<!-- The Ink Wash Mask -->
<div 
  bind:this={inkWashNode} 
  class="fixed top-0 left-0 z-[1000011] rounded-full pointer-events-none blur-edge"
  style="width: 100px; height: 100px; margin-left: -50px; margin-top: -50px; display: none; background-color: currentColor;"
></div>

<!-- Initial Access Palette Picker -->
{#if showInitPanel}
  <div class="fixed inset-0 z-[1000010] flex items-center justify-center overflow-hidden bg-[var(--color-bg)] p-4 md:p-6">
    <div class="aura-shell aura-shell--picker w-full max-w-5xl" role="dialog" aria-modal="true" aria-labelledby="theme-picker-title">
      <div class="aura-picker-copy">
        <div class="max-w-xl">
          <p class="aura-kicker">Theme Archive</p>
          <h2 id="theme-picker-title" class="text-[2rem] md:text-[2.8rem] font-black text-[#fff4ed] tracking-[-0.04em] leading-none">Pick Your Aura</h2>
          <p class="mt-2 text-[13px] md:text-[14px] text-[rgba(255,244,237,0.72)] leading-6">
            先选一种今天网站的气色，整站背景、阴影和发光会一起切换。
          </p>
        </div>

        <p class="max-w-sm text-[10px] font-semibold uppercase tracking-[0.2em] text-[rgba(255,244,237,0.42)]">
          Split palette cards below echo the reference boards directly.
        </p>
      </div>

      <div class="aura-picker-grid">
        {#each themes as theme}
          <button 
            type="button"
            on:click|preventDefault|stopPropagation={(e) => handleThemeSwitch(theme.id, e, true)}
            data-theme-id={theme.id}
            class="aura-card group relative overflow-hidden rounded-[28px] md:rounded-[40px] border border-white/10 bg-white/5 text-left transition-all duration-500 hover:scale-[1.015] hover:border-white/25 active:scale-[0.985]"
            style="--aura-a: {theme.primary}; --aura-b: {theme.secondary}; --aura-ink: {theme.accent}; --aura-bg: {theme.bg};"
          >
            <div class="aura-card-bg"></div>
            <div class="aura-card-noise"></div>

            <div class="aura-card-content relative z-[1]">
              <div class="aura-card-head">
                <div>
                  <span class="aura-tag">{theme.liquidLabel}</span>
                  <p class="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/68">{theme.pair}</p>
                </div>

                <span class="aura-chip">整站切换</span>
              </div>

              <div class="aura-card-body">
                <div class="flex items-center gap-3">
                  <span class="aura-swatches" aria-hidden="true">
                    <span class="aura-swatch is-first"></span>
                    <span class="aura-swatch is-second"></span>
                  </span>
                  <div class="min-w-0">
                    <strong class="block text-[1.45rem] md:text-[1.8rem] font-black tracking-[-0.04em] leading-none text-white">{theme.displayName}</strong>
                    <span class="mt-1.5 block text-[11px] md:text-[12px] font-medium leading-5 text-white/76">{theme.mood}</span>
                  </div>
                </div>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .blur-edge {
    will-change: transform, opacity;
  }

  .aura-shell {
    position: relative;
  }

  .aura-shell--picker {
    display: grid;
    gap: 1.3rem;
    align-items: center;
    justify-items: center;
    padding: 1.1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2.25rem;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
      linear-gradient(180deg, rgba(var(--color-bg-rgb), 0.42), rgba(var(--color-bg-rgb), 0.24));
    box-shadow:
      0 28px 64px rgba(var(--shadow-rgb), 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(24px) saturate(1.06);
  }

  .aura-picker-copy {
    display: grid;
    gap: 0.55rem;
    width: 100%;
    justify-items: center;
    text-align: center;
  }

  .aura-picker-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
    width: min(100%, 46rem);
    margin-inline: auto;
    align-items: stretch;
  }

  .aura-card {
    min-height: clamp(12rem, 25vh, 15rem);
    box-shadow:
      0 18px 38px rgba(var(--shadow-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .aura-card-content {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    gap: 1rem;
    padding: 1rem 1rem 1.05rem;
  }

  .aura-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .aura-card-body {
    display: flex;
    align-items: center;
  }

  .aura-kicker {
    margin-bottom: 0.7rem;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(255, 244, 237, 0.46);
  }

  .aura-card-bg,
  .aura-card-noise {
    position: absolute;
    inset: 0;
  }

  .aura-card-bg {
    background:
      radial-gradient(circle at 24% 26%, rgba(255, 255, 255, 0.26), transparent 26%),
      radial-gradient(circle at 80% 24%, rgba(255, 255, 255, 0.18), transparent 22%),
      linear-gradient(105deg, var(--aura-a) 0 50%, var(--aura-b) 50% 100%);
    transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), filter 0.9s ease;
  }

  .aura-card:hover .aura-card-bg,
  .aura-card:focus-visible .aura-card-bg {
    transform: scale(1.04);
    filter: saturate(1.04);
  }

  .aura-card-noise {
    background:
      linear-gradient(125deg, rgba(255, 255, 255, 0.2), transparent 26%),
      linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.08) 100%);
    mix-blend-mode: screen;
    opacity: 0.84;
  }

  .aura-tag,
  .aura-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.8rem;
    border-radius: 999px;
    padding: 0.38rem 0.78rem;
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    backdrop-filter: blur(20px);
  }

  .aura-tag {
    background: rgba(var(--glow-primary-rgb), 0.18);
    color: white;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
  }

  .aura-chip {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.14);
    color: rgba(255, 255, 255, 0.72);
  }

  .aura-card:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.82);
    outline-offset: 4px;
  }

  .aura-swatches {
    position: relative;
    display: inline-flex;
    width: 3.15rem;
    height: 3.15rem;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
  }

  .aura-swatch {
    position: absolute;
    width: 2.15rem;
    height: 2.15rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18);
  }

  .aura-swatch.is-first {
    left: 0.15rem;
    background: var(--aura-a);
    transform: rotate(-10deg);
  }

  .aura-swatch.is-second {
    right: 0.1rem;
    background: var(--aura-b);
    transform: rotate(10deg);
  }

  h2 {
    font-family: 'Outfit', 'PingFang SC', sans-serif;
  }

  @media (max-width: 767px) {
    .aura-shell--picker {
      gap: 1rem;
    }

    .aura-picker-grid {
      gap: 0.7rem;
      width: min(100%, 24rem);
    }

    .aura-card {
      min-height: clamp(10rem, 22vh, 12.2rem);
    }

    .aura-card-content {
      gap: 0.75rem;
      padding: 0.85rem;
    }
  }
</style>
