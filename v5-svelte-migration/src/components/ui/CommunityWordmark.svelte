<script lang="ts">
  let className = '';
  export { className as class };
</script>

<div class="community-wordmark {className}">
  <svg
    class="community-wordmark-svg"
    viewBox="0 0 1600 320"
    role="img"
    aria-label="8community"
    shape-rendering="geometricPrecision"
    text-rendering="geometricPrecision"
  >
    <defs>
      <linearGradient id="community-accent" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" style="stop-color: var(--color-primary); stop-opacity: 1;" />
        <stop offset="100%" style="stop-color: var(--color-secondary); stop-opacity: 0.92;" />
      </linearGradient>

      <linearGradient id="community-beam" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#ffffff00" />
        <stop offset="42%" stop-color="#ffffffd9" />
        <stop offset="100%" stop-color="#ffffff00" />
      </linearGradient>

      <filter id="community-shadow" x="-16%" y="-24%" width="132%" height="164%">
        <feGaussianBlur stdDeviation="7" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 0.22 0"
          result="shadow"
        />
        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <mask id="community-word-mask">
        <text x="42" y="196" class="mask-text">8community</text>
      </mask>
    </defs>

    <rect class="community-frame" x="24" y="38" width="1488" height="224" rx="112" />

    <path class="community-guide" d="M56 94h118" />
    <path class="community-guide community-guide-right" d="M1324 206h168" />

    <text x="42" y="196" class="community-text-shadow">8community</text>
    <text x="42" y="196" class="community-text">8community</text>

    <g mask="url(#community-word-mask)" aria-hidden="true">
      <rect class="community-beam" x="-320" y="28" width="320" height="264" fill="url(#community-beam)" />
    </g>

    <path class="community-underline" d="M246 226 H1116 C1164 226, 1210 214, 1254 188" />
    <circle class="community-pulse" cx="1288" cy="180" r="10" />
    <circle class="community-pulse-ring" cx="1288" cy="180" r="22" />
    <text x="1318" y="188" class="community-tag">live now</text>
  </svg>
</div>

<style>
  .community-wordmark {
    position: relative;
    width: min(100%, 58rem);
  }

  .community-wordmark::before,
  .community-wordmark::after {
    content: '';
    position: absolute;
    pointer-events: none;
    filter: blur(34px);
  }

  .community-wordmark::before {
    left: 1rem;
    top: 2.2rem;
    width: 8rem;
    height: 5rem;
    background: radial-gradient(circle, rgba(var(--glow-primary-rgb), 0.22), transparent 72%);
    opacity: 0.62;
  }

  .community-wordmark::after {
    right: 6%;
    top: 0.8rem;
    width: 11rem;
    height: 5.5rem;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.1), transparent 74%);
    opacity: 0.55;
  }

  .community-wordmark-svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .community-frame {
    fill: rgba(var(--color-bg-rgb), 0.26);
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 1.5;
  }

  .community-guide {
    fill: none;
    stroke: rgba(255, 255, 255, 0.22);
    stroke-linecap: round;
    stroke-width: 2.5;
  }

  .community-guide-right {
    opacity: 0.52;
  }

  .community-text,
  .community-text-shadow,
  .mask-text {
    font-family: 'Outfit', 'SF Pro Display', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
    font-size: 184px;
    font-weight: 900;
    letter-spacing: -0.065em;
    text-transform: lowercase;
  }

  .community-text-shadow {
    fill: rgba(var(--shadow-rgb), 0.34);
    filter: url(#community-shadow);
  }

  .community-text {
    fill: var(--color-text);
    stroke: rgba(255, 255, 255, 0.09);
    stroke-width: 2;
    paint-order: stroke fill;
  }

  .mask-text {
    fill: #fff;
  }

  .community-beam {
    opacity: 0.7;
    mix-blend-mode: screen;
    animation: beamSweep 5.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .community-underline {
    fill: none;
    stroke: url(#community-accent);
    stroke-linecap: round;
    stroke-width: 6;
    opacity: 0.94;
  }

  .community-pulse {
    fill: url(#community-accent);
    opacity: 0.96;
  }

  .community-pulse-ring {
    fill: none;
    stroke: rgba(var(--glow-primary-rgb), 0.5);
    stroke-width: 2.5;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulseRing 3s ease-in-out infinite;
  }

  .community-tag {
    fill: rgba(255, 255, 255, 0.6);
    font-family: 'Outfit', 'SF Pro Display', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
  }

  @keyframes beamSweep {
    0% {
      transform: translateX(0);
      opacity: 0;
    }

    18% {
      opacity: 0.72;
    }

    82% {
      opacity: 0.72;
    }

    100% {
      transform: translateX(1860px);
      opacity: 0;
    }
  }

  @keyframes pulseRing {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.94);
    }

    50% {
      opacity: 1;
      transform: scale(1.08);
    }
  }

  @media (max-width: 900px) {
    .community-text,
    .community-text-shadow,
    .mask-text {
      font-size: 160px;
      letter-spacing: -0.055em;
    }

    .community-tag {
      font-size: 22px;
      letter-spacing: 0.22em;
    }
  }

  @media (max-width: 640px) {
    .community-wordmark {
      width: 100%;
    }

    .community-text,
    .community-text-shadow,
    .mask-text {
      font-size: 126px;
      letter-spacing: -0.04em;
    }

    .community-tag {
      font-size: 16px;
      letter-spacing: 0.16em;
    }

    .community-guide {
      stroke-width: 1.8;
    }

    .community-underline {
      stroke-width: 4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .community-beam,
    .community-pulse-ring {
      animation: none !important;
    }
  }
</style>
