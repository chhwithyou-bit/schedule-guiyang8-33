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
      <linearGradient id="community-fill" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#fff6d6">
          <animate attributeName="stop-color" values="#fff6d6;#fbe7b5;#fff6d6" dur="8s" repeatCount="indefinite" />
        </stop>
        <stop offset="42%" stop-color="#fffdf6">
          <animate attributeName="stop-color" values="#fffdf6;#fff0c8;#fffdf6" dur="8s" repeatCount="indefinite" />
        </stop>
        <stop offset="100%" stop-color="#b2d8ff">
          <animate attributeName="stop-color" values="#b2d8ff;#d6c9ff;#b2d8ff" dur="8s" repeatCount="indefinite" />
        </stop>
      </linearGradient>

      <linearGradient id="community-sheen" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#ffffff00" />
        <stop offset="48%" stop-color="#ffffffcc" />
        <stop offset="100%" stop-color="#ffffff00" />
      </linearGradient>

      <filter id="community-glow" x="-20%" y="-30%" width="140%" height="180%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 0.28 0"
          result="softGlow"
        />
        <feMerge>
          <feMergeNode in="softGlow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="community-shadow" x="-20%" y="-30%" width="140%" height="180%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(4, 8, 26, 0.22)" />
      </filter>

      <mask id="community-mask">
        <text x="18" y="196" class="mask-text">8community</text>
      </mask>
    </defs>

    <g class="community-orbits" aria-hidden="true">
      <circle class="orbit orbit-one" cx="116" cy="82" r="54" />
      <circle class="orbit orbit-two" cx="142" cy="112" r="33" />
      <circle class="spark" cx="196" cy="46" r="6" />
    </g>

    <text x="18" y="196" class="community-outline">8community</text>
    <text x="18" y="196" class="community-fill">8community</text>

    <g mask="url(#community-mask)" aria-hidden="true">
      <rect class="community-sweep" x="-260" y="-24" width="240" height="260" fill="url(#community-sheen)" />
    </g>

    <path
      class="community-wave"
      d="M 24 236 C 152 208, 250 274, 380 236 S 644 202, 806 230 S 1118 286, 1450 218"
    />
    <path
      class="community-wave community-wave-soft"
      d="M 54 262 C 232 282, 372 218, 522 246 S 862 306, 1212 248 S 1440 224, 1560 238"
    />
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
    filter: blur(32px);
  }

  .community-wordmark::before {
    left: -2rem;
    top: 1rem;
    height: 6rem;
    width: 6rem;
    background: radial-gradient(circle, rgba(255, 244, 210, 0.18), transparent 72%);
    opacity: 0.45;
  }

  .community-wordmark::after {
    right: 10%;
    top: 0;
    height: 4.8rem;
    width: 10rem;
    background: radial-gradient(circle, rgba(129, 188, 255, 0.16), transparent 72%);
    opacity: 0.42;
  }

  .community-wordmark-svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    filter: url(#community-shadow);
  }

  .community-fill,
  .community-outline,
  .mask-text {
    font-family: 'Cormorant Garamond', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
    font-size: 190px;
    font-style: italic;
    font-weight: 700;
    letter-spacing: 6px;
    text-transform: lowercase;
  }

  .community-fill {
    fill: url(#community-fill);
    filter: url(#community-glow);
    paint-order: stroke fill;
    stroke: rgba(255, 255, 255, 0.18);
    stroke-width: 0.8;
  }

  .community-outline {
    fill: none;
    stroke: rgba(255, 247, 224, 0.42);
    stroke-dasharray: 10 14;
    stroke-width: 1.8;
    animation: outlineDrift 16s linear infinite;
  }

  .mask-text {
    fill: #fff;
  }

  .community-sweep {
    opacity: 0.66;
    mix-blend-mode: screen;
    animation: sweepAcross 5.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .community-wave {
    fill: none;
    stroke: url(#community-fill);
    stroke-dasharray: 12 20;
    stroke-linecap: round;
    stroke-width: 3;
    opacity: 0.84;
    animation: waveDrift 13s linear infinite;
  }

  .community-wave-soft {
    stroke-width: 1.8;
    opacity: 0.22;
    animation-duration: 18s;
    animation-direction: reverse;
  }

  .orbit {
    fill: none;
    stroke: rgba(255, 247, 224, 0.2);
    transform-box: fill-box;
    transform-origin: center;
  }

  .orbit-one {
    stroke-dasharray: 8 10;
    stroke-width: 1.2;
    animation: orbitSpin 14s linear infinite;
  }

  .orbit-two {
    stroke-dasharray: 3 8;
    stroke-width: 1.3;
    animation: orbitSpinReverse 10s linear infinite;
  }

  .spark {
    fill: rgba(255, 250, 236, 0.95);
    filter: url(#community-glow);
    animation: sparkle 3.2s ease-in-out infinite;
  }

  @keyframes sweepAcross {
    0% {
      transform: translateX(0) rotate(11deg);
      opacity: 0;
    }

    18% {
      opacity: 0.92;
    }

    82% {
      opacity: 0.92;
    }

    100% {
      transform: translateX(1880px) rotate(11deg);
      opacity: 0;
    }
  }

  @keyframes outlineDrift {
    0% {
      stroke-dashoffset: 0;
    }

    100% {
      stroke-dashoffset: -180;
    }
  }

  @keyframes waveDrift {
    0% {
      stroke-dashoffset: 0;
    }

    100% {
      stroke-dashoffset: -240;
    }
  }

  @keyframes orbitSpin {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes orbitSpinReverse {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(-360deg);
    }
  }

  @keyframes sparkle {
    0%,
    100% {
      opacity: 0.45;
      transform: scale(0.88);
    }

    50% {
      opacity: 1;
      transform: scale(1.22);
    }
  }

  @media (max-width: 900px) {
    .community-fill,
    .community-outline,
    .mask-text {
      font-size: 160px;
      letter-spacing: 4px;
    }
  }

  @media (max-width: 640px) {
    .community-wordmark {
      width: 100%;
    }

    .community-fill,
    .community-outline,
    .mask-text {
      font-size: 126px;
      letter-spacing: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .community-sweep,
    .community-wave,
    .community-outline,
    .orbit-one,
    .orbit-two,
    .spark {
      animation: none !important;
    }
  }
</style>
