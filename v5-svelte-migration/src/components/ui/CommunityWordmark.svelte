<script lang="ts">
  let className = '';
  export { className as class };
</script>

<div class="community-showcase {className}" aria-label="8community">
  <div class="showcase-inner">
    <!-- Ambient Background Effects -->
    <div class="ambient-glow"></div>
    <div class="grid-pattern"></div>
    
    <!-- Main Content -->
    <div class="content-wrapper">
      <div class="text-wrapper">
        <span class="text-bg" aria-hidden="true">8community</span>
        <span class="text-fg">8community</span>
      </div>
      
      <div class="status-badge">
        <div class="status-dot">
          <div class="dot-ping"></div>
          <div class="dot-core"></div>
        </div>
        <span class="status-text">LIVE NOW</span>
      </div>
    </div>
    
    <!-- Decorative Elements -->
    <div class="dec-line dec-line-left"></div>
    <div class="dec-line dec-line-right"></div>
  </div>
</div>

<style>
  .community-showcase {
    position: relative;
    width: 100%;
    /* Maintain a sleek wide aspect ratio */
    aspect-ratio: 5 / 1.2;
    min-height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 48px;
    background: linear-gradient(145deg, rgba(var(--color-bg-rgb), 0.4), rgba(var(--color-bg-rgb), 0.1));
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 
      inset 0 0 40px rgba(var(--glow-primary-rgb), 0.05),
      0 20px 40px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    animation: float 6s ease-in-out infinite;
  }

  .showcase-inner {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .ambient-glow {
    position: absolute;
    inset: -20%;
    background: 
      radial-gradient(circle at 20% 50%, rgba(var(--glow-primary-rgb), 0.25) 0%, transparent 50%),
      radial-gradient(circle at 80% 50%, rgba(var(--glow-secondary-rgb), 0.25) 0%, transparent 50%);
    filter: blur(40px);
    animation: breathe 8s ease-in-out infinite alternate;
    z-index: 0;
  }

  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 30px 30px;
    background-position: center center;
    mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
    z-index: 1;
    animation: pan 30s linear infinite;
  }

  .content-wrapper {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 2.5rem;
    padding: 0 2rem;
  }

  .text-wrapper {
    position: relative;
    font-family: 'Outfit', 'SF Pro Display', 'PingFang SC', sans-serif;
    font-size: clamp(2.5rem, 7.5vw, 6.5rem);
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 1;
    user-select: none;
  }

  .text-bg {
    position: absolute;
    inset: 0;
    color: transparent;
    -webkit-text-stroke: 2px rgba(var(--glow-primary-rgb), 0.15);
    transform: translate(4px, 4px);
    filter: blur(12px);
    opacity: 0.4;
  }

  .text-fg {
    position: relative;
    background: linear-gradient(
      to right, 
      var(--color-text) 0%, 
      rgba(var(--glow-primary-rgb), 1) 25%, 
      rgba(var(--glow-secondary-rgb), 1) 50%, 
      rgba(var(--glow-primary-rgb), 1) 75%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: shine 4s linear infinite;
    filter: drop-shadow(0 0 15px rgba(var(--glow-primary-rgb), 0.3));
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1.25rem;
    border-radius: 999px;
    background: rgba(var(--color-bg-rgb), 0.6);
    border: 1px solid rgba(var(--glow-primary-rgb), 0.3);
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    transform: translateY(0.2rem);
  }

  .status-dot {
    position: relative;
    width: 10px;
    height: 10px;
  }

  .dot-ping {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: var(--color-primary);
    opacity: 0.6;
    animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  .dot-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow: 0 0 12px var(--color-primary);
  }

  .status-text {
    font-size: clamp(0.7rem, 1.5vw, 0.9rem);
    font-weight: 800;
    letter-spacing: 0.25em;
    color: rgba(255, 255, 255, 0.85);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .dec-line {
    position: absolute;
    top: 50%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(var(--glow-primary-rgb), 0.3), transparent);
    width: 12%;
    z-index: 5;
  }

  .dec-line-left {
    left: 4%;
    transform: translateY(-50%);
  }

  .dec-line-right {
    right: 4%;
    transform: translateY(-50%);
  }

  @keyframes breathe {
    0% { transform: scale(1); opacity: 0.5; }
    100% { transform: scale(1.15); opacity: 0.9; }
  }

  @keyframes pan {
    0% { background-position: 0 0; }
    100% { background-position: 60px 60px; }
  }

  @keyframes shine {
    to { background-position: 200% center; }
  }

  @keyframes ping {
    75%, 100% { transform: scale(2.8); opacity: 0; }
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  @media (max-width: 1024px) {
    .community-showcase {
      aspect-ratio: auto;
      padding: 2.5rem 1.5rem;
      border-radius: 32px;
    }
    .dec-line {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .content-wrapper {
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
      padding: 0;
    }
    .status-badge {
      transform: none;
    }
    .text-wrapper {
      font-size: clamp(3rem, 12vw, 5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .community-showcase,
    .ambient-glow,
    .grid-pattern,
    .text-fg,
    .dot-ping {
      animation: none !important;
    }
    .text-fg {
      background-size: 100% auto;
    }
  }
</style>
