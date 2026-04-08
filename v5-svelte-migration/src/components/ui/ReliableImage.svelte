<script lang="ts">
  import { onDestroy } from 'svelte';

  export let src = '';
  export let alt = '';
  export let imgClass = '';
  export let wrapperClass = '';
  export let loading: 'lazy' | 'eager' = 'lazy';
  export let decoding: 'sync' | 'async' | 'auto' = 'async';
  export let retries = 2;
  export let retryDelay = 450;
  export let placeholderText = '图片暂时没加载出来';

  let attempts = 0;
  let loaded = false;
  let failed = false;
  let renderedSrc = '';
  let lastSource = '';
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function resetState(nextSource: string) {
    clearRetryTimer();
    attempts = 0;
    loaded = false;
    failed = !nextSource;
    renderedSrc = nextSource;
  }

  function buildRetrySource() {
    if (!src) return '';
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}_img_retry=${Date.now()}-${attempts}`;
  }

  function handleLoad() {
    clearRetryTimer();
    loaded = true;
    failed = false;
  }

  function handleError() {
    clearRetryTimer();

    if (!src) {
      failed = true;
      loaded = false;
      return;
    }

    if (attempts < retries) {
      const nextAttempt = attempts + 1;
      attempts = nextAttempt;
      loaded = false;
      retryTimer = setTimeout(() => {
        renderedSrc = buildRetrySource();
      }, retryDelay * nextAttempt);
      return;
    }

    failed = true;
  }

  $: if (src !== lastSource) {
    lastSource = src;
    resetState(src);
  }

  onDestroy(clearRetryTimer);
</script>

<div class={`reliable-image relative h-full w-full overflow-hidden ${wrapperClass}`}>
  {#if renderedSrc && !failed}
    <img
      src={renderedSrc}
      alt={alt}
      class={`reliable-image__img ${loaded ? 'is-loaded' : 'is-loading'} ${imgClass}`}
      {loading}
      {decoding}
      draggable="false"
      on:load={handleLoad}
      on:error={handleError}
    />
  {/if}

  {#if !loaded && !failed}
    <div aria-hidden="true" class="reliable-image__skeleton absolute inset-0"></div>
  {/if}

  {#if failed}
    <div class="reliable-image__fallback absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[11px] font-bold text-white/70">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2.5"></rect>
        <circle cx="8.5" cy="8.5" r="1.4"></circle>
        <path d="M21 15l-4.5-4.5L7 20"></path>
      </svg>
      <span>{placeholderText}</span>
    </div>
  {/if}
</div>

<style>
  .reliable-image__img {
    transition: opacity 220ms ease, transform 220ms ease;
  }

  .reliable-image__img.is-loading {
    opacity: 0;
  }

  .reliable-image__img.is-loaded {
    opacity: 1;
  }

  .reliable-image__skeleton {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02)),
      rgba(255, 255, 255, 0.04);
    background-size: 200% 100%;
    animation: reliable-image-shimmer 1.4s ease-in-out infinite;
  }

  .reliable-image__fallback {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.18));
    backdrop-filter: blur(8px);
  }

  @keyframes reliable-image-shimmer {
    0% {
      background-position: 200% 0;
    }

    100% {
      background-position: -200% 0;
    }
  }
</style>