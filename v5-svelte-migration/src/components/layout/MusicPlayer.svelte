<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Track = {
    name: string;
    artist: string;
    url: string;
    cover?: string | null;
  };

  const FALLBACK_TRACK: Track = {
    name: '正在找歌',
    artist: '稍等一下，马上就好',
    url: '',
    cover: null
  };
  const PANEL_MARGIN = 12;
  const CLOSED_PANEL_SIZE_REM = 3.75;
  const OPEN_PANEL_WIDTH_REM = 21.5;
  const PANEL_RESYNC_DELAY_MS = 340;

  let audioEl: HTMLAudioElement;
  let widgetEl: HTMLDivElement;

  let isOpen = false;
  let isListOpen = false;
  let isPlaying = false;
  let progress = 0;
  let duration = 0;
  let currentTime = 0;
  let search = '';
  let errorMessage = '';
  let loadState: 'loading' | 'ready' | 'empty' | 'error' = 'loading';
  let playlist: Track[] = [];
  let currentIndex = 0;
  let lastBoundUrl = '';
  let filteredTracks: Track[] = [];
  let currentTrack: Track = FALLBACK_TRACK;
  let queuePreview: Track[] = [];

  let panelLeft = 24;
  let panelTop = 24;
  let panelReady = false;
  let isDraggingWidget = false;
  let dragPointerId: number | null = null;
  let dragCaptureEl: HTMLElement | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragMoved = false;
  let panelResyncTimer: ReturnType<typeof setTimeout> | null = null;

  $: filteredTracks = playlist.filter((track) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [track.name, track.artist].some((value) => String(value || '').toLowerCase().includes(needle));
  });

  $: currentTrack = playlist[currentIndex] || getFallbackTrack();

  $: queuePreview = playlist
    .filter((_, index) => index !== currentIndex)
    .slice(0, 3);

  $: if (audioEl && currentTrack.url && currentTrack.url !== lastBoundUrl) {
    bindTrackToAudio(currentTrack.url);
  }

  onMount(() => {
    void loadPlaylist();
    void syncPanelPosition({ reset: true });

    const handleResize = () => {
      clampPanelToViewport();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearPanelResyncTimer();

      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      }
    };
  });

  function getFallbackTrack(): Track {
    if (loadState === 'error') {
      return { name: '音乐出了点小状况', artist: '稍后再试一次', url: '', cover: null };
    }
    if (loadState === 'empty') {
      return { name: '这里还没有歌', artist: '上传几首，播放器就会热闹起来', url: '', cover: null };
    }
    return FALLBACK_TRACK;
  }

  function normalizeTrack(track: any, index: number): Track | null {
    if (!track || typeof track !== 'object') return null;
    const url = String(track.url || '').trim();
    if (!url) return null;

    return {
      name: String(track.name || '').trim() || `第 ${index + 1} 首`,
      artist: String(track.artist || '').trim() || '未署名歌手',
      url,
      cover: String(track.cover || '').trim() || null
    };
  }

  async function loadPlaylist() {
    errorMessage = '';
    loadState = 'loading';

    try {
      const response = await fetch('/api/music');
      if (!response.ok) {
        throw new Error(`playlist request failed with ${response.status}`);
      }

      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.list) ? payload.list : [];
      const normalized = list
        .map((track: unknown, index: number) => normalizeTrack(track, index))
        .filter(Boolean) as Track[];

      playlist = normalized;
      currentIndex = 0;
      lastBoundUrl = '';
      progress = 0;
      currentTime = 0;
      duration = 0;
      isPlaying = false;

      if (playlist.length === 0) {
        loadState = 'empty';
        resetAudioElement();
        return;
      }

      loadState = 'ready';
    } catch (error) {
      console.error('Failed to load music playlist', error);
      playlist = [];
      currentIndex = 0;
      lastBoundUrl = '';
      progress = 0;
      currentTime = 0;
      duration = 0;
      isPlaying = false;
      loadState = 'error';
      errorMessage = '歌单没加载出来，稍后再试一次。';
      resetAudioElement();
    } finally {
      await syncPanelPosition();
    }
  }

  function resetAudioElement() {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  }

  function bindTrackToAudio(url: string, autoplay = false) {
    if (!audioEl || !url) return;
    lastBoundUrl = url;
    progress = 0;
    currentTime = 0;
    duration = 0;
    audioEl.src = url;
    audioEl.load();

    if (autoplay) {
      void playCurrent();
    }
  }

  async function togglePlayer() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    isOpen = !isOpen;

    if (!isOpen) {
      isListOpen = false;
      search = '';
    }

    await syncPanelPosition({ preserveTop: isOpen });
  }

  async function collapsePlayer(event: Event) {
    event.stopPropagation();
    isOpen = false;
    isListOpen = false;
    search = '';
    await syncPanelPosition();
  }

  async function playCurrent() {
    if (!audioEl || !currentTrack.url) return;
    errorMessage = '';

    try {
      await audioEl.play();
      isPlaying = true;
    } catch (error) {
      console.error('Audio playback failed', error);
      isPlaying = false;
      errorMessage = '这首歌现在放不了，换一首试试。';
    }
  }

  function pauseCurrent() {
    if (!audioEl) return;
    audioEl.pause();
    isPlaying = false;
  }

  function togglePlay(event: Event) {
    event.stopPropagation();

    if (!currentTrack.url) {
      if (loadState !== 'loading') {
        void loadPlaylist();
      }
      return;
    }

    if (isPlaying) {
      pauseCurrent();
    } else {
      void playCurrent();
    }
  }

  function selectTrack(index: number, autoplay = true) {
    if (!playlist[index]) return;
    currentIndex = index;
    errorMessage = '';
    lastBoundUrl = '';
    bindTrackToAudio(playlist[index].url, autoplay);
  }

  function handleTrackSelect(index: number, event: Event) {
    event.stopPropagation();
    selectTrack(index, true);
  }

  function playNext(event?: Event, autoplay = true) {
    event?.stopPropagation();
    if (!playlist.length) return;
    const nextIndex = (currentIndex + 1) % playlist.length;
    selectTrack(nextIndex, autoplay);
  }

  function playPrevious(event?: Event, autoplay = true) {
    event?.stopPropagation();
    if (!playlist.length) return;
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    selectTrack(prevIndex, autoplay);
  }

  async function toggleList(event: Event) {
    event.stopPropagation();
    if (!isOpen) isOpen = true;
    isListOpen = !isListOpen;
    await syncPanelPosition({ preserveTop: true });
  }

  function handleTimeUpdate() {
    if (!audioEl) return;
    currentTime = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
    duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  }

  function handleLoadedMetadata() {
    if (!audioEl) return;
    duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
  }

  function handleEnded() {
    if (playlist.length > 1) {
      playNext(undefined, true);
      return;
    }
    pauseCurrent();
    progress = 0;
    currentTime = 0;
  }

  function handleAudioError() {
    isPlaying = false;
    errorMessage = '歌曲地址连不上了。';
  }

  function handleSeekInput(event: Event) {
    if (!audioEl || !duration) return;
    const targetValue = Number((event.currentTarget as HTMLInputElement).value || 0);
    audioEl.currentTime = targetValue;
    currentTime = targetValue;
    progress = duration > 0 ? (targetValue / duration) * 100 : 0;
  }

  async function syncPanelPosition(options: { reset?: boolean; preserveTop?: boolean } = {}) {
    await tick();
    if (!widgetEl || typeof window === 'undefined') return;

    const { reset = false, preserveTop = false } = options;
    const { width, height } = getPanelDimensions();

    if (!panelReady || reset) {
      panelLeft = getDockedPanelLeft(width);
      panelTop = getDockedPanelTop(height);
      panelReady = true;
    } else if (isOpen) {
      panelLeft = Math.min(panelLeft, getDockedPanelLeft(width));
    }

    if (preserveTop) {
      clampPanelHorizontally(width);
    } else {
      clampPanelToViewport(width, height);
    }

    schedulePanelResync();
  }

  function getRootFontSize() {
    if (typeof window === 'undefined') return 16;
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
    return Number.isFinite(rootFontSize) ? rootFontSize : 16;
  }

  function getPreferredPanelWidth() {
    const rootFontSize = getRootFontSize();
    const compactWidth = CLOSED_PANEL_SIZE_REM * rootFontSize;
    if (!isOpen || typeof window === 'undefined') return compactWidth;
    return Math.min(OPEN_PANEL_WIDTH_REM * rootFontSize, window.innerWidth - 24);
  }

  function getPanelDockInset() {
    if (typeof window === 'undefined') return 24;
    if (!isOpen) return 24;
    return Math.min(88, Math.max(40, Math.round(window.innerWidth * 0.05)));
  }

  function getDockedPanelLeft(width: number) {
    if (typeof window === 'undefined') return PANEL_MARGIN;
    return Math.max(PANEL_MARGIN, window.innerWidth - width - getPanelDockInset());
  }

  function getDockedPanelTop(height: number) {
    if (typeof window === 'undefined') return PANEL_MARGIN;
    return Math.max(PANEL_MARGIN, window.innerHeight - height - 24);
  }

  function getPanelDimensions() {
    if (!widgetEl) {
      return {
        width: getPreferredPanelWidth(),
        height: CLOSED_PANEL_SIZE_REM * getRootFontSize()
      };
    }

    const rect = widgetEl.getBoundingClientRect();
    const fallbackSize = CLOSED_PANEL_SIZE_REM * getRootFontSize();

    return {
      width: Math.max(rect.width || 0, getPreferredPanelWidth()),
      height: Math.max(rect.height || 0, fallbackSize)
    };
  }

  function clearPanelResyncTimer() {
    if (panelResyncTimer === null) return;
    clearTimeout(panelResyncTimer);
    panelResyncTimer = null;
  }

  function schedulePanelResync() {
    if (typeof window === 'undefined') return;
    clearPanelResyncTimer();
    panelResyncTimer = window.setTimeout(() => {
      panelResyncTimer = null;
      if (isDraggingWidget) return;
      clampPanelToViewport();
    }, PANEL_RESYNC_DELAY_MS);
  }

  function clampPanelToViewport(width = getPanelDimensions().width, height = getPanelDimensions().height) {
    if (!widgetEl || typeof window === 'undefined') return;

    const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
    const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);

    panelLeft = Math.min(maxLeft, Math.max(PANEL_MARGIN, panelLeft));
    panelTop = Math.min(maxTop, Math.max(PANEL_MARGIN, panelTop));
  }

  function clampPanelHorizontally(width = getPanelDimensions().width) {
    if (!widgetEl || typeof window === 'undefined') return;
    const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
    panelLeft = Math.min(maxLeft, Math.max(PANEL_MARGIN, panelLeft));
  }

  function handleDragPointerDown(event: PointerEvent) {
    if (!widgetEl) return;
    event.preventDefault();
    event.stopPropagation();
    clearPanelResyncTimer();

    dragPointerId = event.pointerId;
    dragCaptureEl = event.currentTarget as HTMLElement;
    dragOffsetX = event.clientX - panelLeft;
    dragOffsetY = event.clientY - panelTop;
    dragMoved = false;
    isDraggingWidget = true;

    dragCaptureEl?.setPointerCapture(event.pointerId);
  }

  function handleDragPointerMove(event: PointerEvent) {
    if (!isDraggingWidget || event.pointerId !== dragPointerId) return;
    event.preventDefault();

    const nextLeft = event.clientX - dragOffsetX;
    const nextTop = event.clientY - dragOffsetY;

    if (Math.abs(nextLeft - panelLeft) + Math.abs(nextTop - panelTop) > 2) {
      dragMoved = true;
    }

    panelLeft = nextLeft;
    panelTop = nextTop;
    clampPanelToViewport();
  }

  function finishDragging(event?: PointerEvent) {
    if (event && dragPointerId !== null && event.pointerId !== dragPointerId) return;

    if (dragCaptureEl && dragPointerId !== null) {
      try {
        dragCaptureEl.releasePointerCapture(dragPointerId);
      } catch {}
    }

    dragPointerId = null;
    dragCaptureEl = null;
    isDraggingWidget = false;
  }

  function formatTime(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0:00';
    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function getPlaybackEyebrow() {
    if (loadState === 'loading') return '正在准备';
    if (loadState === 'error') return '出了点问题';
    if (loadState === 'empty') return '歌单还是空的';
    if (isPlaying) return '现在在放';
    if (currentTime > 0) return '先停在这里';
    return '点一下就能开始';
  }

  function getPlaybackNote() {
    if (loadState === 'loading') return '歌单正在整理，等一下就能听。';
    if (loadState === 'error') return errorMessage || '播放器刚刚绊了一下，稍后再试。';
    if (loadState === 'empty') return '把音频传上来之后，这里就会变成你的随身歌单。';
    if (playlist.length > 1) return `后面还有 ${Math.max(playlist.length - 1, 0)} 首，想换歌直接点下面。`;
    return '先从这一首开始，慢慢听。';
  }
</script>

<svelte:window
  on:pointermove={handleDragPointerMove}
  on:pointerup={finishDragging}
  on:pointercancel={finishDragging}
/>

<audio
  bind:this={audioEl}
  preload="metadata"
  playsinline
  on:timeupdate={handleTimeUpdate}
  on:loadedmetadata={handleLoadedMetadata}
  on:ended={handleEnded}
  on:error={handleAudioError}
></audio>

<div
  bind:this={widgetEl}
  id="mp"
  class:open={isOpen}
  class:dragging={isDraggingWidget}
  class="fixed z-[10050] overflow-visible transition-[left,top,width,height,box-shadow] duration-300 ease-[cubic-bezier(0.2,1.14,0.24,1)]"
  style="left: {panelLeft}px; top: {panelTop}px; width: {isOpen ? 'min(21.5rem, calc(100vw - 1.5rem))' : '3.75rem'};"
  on:click={() => !isOpen && togglePlayer()}
  on:keydown={(event) => !isOpen && event.key === 'Enter' && togglePlayer()}
  role="button"
  tabindex="0"
>
  <button
    id="mp-drag-handle"
    class:open={isOpen}
    class="mp-drag-handle"
    type="button"
    aria-label="Drag music player"
    on:pointerdown={handleDragPointerDown}
  >
    <span></span>
    <span></span>
    <span></span>
  </button>

  <div class="mp-shell {isOpen ? 'open' : 'closed'}">
    <div class="mp-main">
      <p id="mp-name" class="mp-sr-only">{currentTrack.name}</p>

      {#if !isOpen}
        <div class="mp-closed">
          <div class="mp-badge">
            {#if currentTrack.cover}
              <img src={currentTrack.cover} alt={currentTrack.name} class="h-full w-full object-cover" />
            {:else}
              <svg class="h-6 w-6 {isPlaying ? 'animate-pulse' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            {/if}
          </div>
        </div>
      {:else}
        <div class="mp-content">
          <div class="mp-topline">
            <div>
              <p class="mp-kicker">随手听歌</p>
              <p class="mp-topline-copy">想拖动的话，按住上面那条就行。</p>
            </div>

            <button class="mp-icon-btn mp-collapse-btn" on:click={collapsePlayer} aria-label="收起播放器">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 15l-6-6-6 6"></path>
              </svg>
            </button>
          </div>

          <section class="mp-hero">
            <div class="mp-badge large mp-cover-card">
              {#if currentTrack.cover}
                <img src={currentTrack.cover} alt={currentTrack.name} class="h-full w-full object-cover" />
              {:else}
                <span>8C</span>
              {/if}
            </div>

            <div class="mp-hero-copy">
              <p class="mp-hero-eyebrow">{getPlaybackEyebrow()}</p>
              <h3 class="mp-track-title">{currentTrack.name}</h3>
              <p class="mp-track-artist">{currentTrack.artist}</p>
              <p class="mp-hero-note">{getPlaybackNote()}</p>
              <div class="mp-meta-row">
                <span>{playlist.length ? `第 ${currentIndex + 1} 首` : '还没开始'}</span>
                <span>{playlist.length ? `共 ${playlist.length} 首` : '没有歌单'}</span>
              </div>
            </div>
          </section>

          {#if !isListOpen && queuePreview.length > 0}
            <div class="mp-queue-panel">
              <div class="mp-list-toolbar compact">
                <p>接下来想听</p>
                <p>点一下就切过去</p>
              </div>
              <div class="mp-queue-strip">
                {#each queuePreview as track}
                  <button
                    type="button"
                    class="mp-queue-chip"
                    on:click={(event) => handleTrackSelect(playlist.findIndex((item) => item.url === track.url), event)}
                  >
                    {track.name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <div class="mp-progress-card">
            <div class="mp-progress-wrap">
              <div class="mp-progress-bar">
                <div class="mp-progress-fill" style="width: {progress}%"></div>
              </div>
              <input
                class="mp-progress-input"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                aria-label="调整播放进度"
                on:input={handleSeekInput}
                on:click|stopPropagation
                on:pointerdown|stopPropagation
              />
              <div class="mp-time-row">
                <span>{formatTime(currentTime)}</span>
                <span>{duration ? formatTime(duration) : '--:--'}</span>
              </div>
            </div>
          </div>

          <div class="mp-actions">
            <button class="mp-icon-btn" on:click={playPrevious} aria-label="上一首">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM18.5 6.2v11.6c0 .8-.9 1.3-1.6.8L9 12.8c-.6-.4-.6-1.3 0-1.7l7.9-5.7c.7-.5 1.6 0 1.6.8z"></path></svg>
            </button>

            <button class="mp-icon-btn mp-play-btn" on:click={togglePlay} aria-label={isPlaying ? '暂停播放' : '开始播放'}>
              {#if isPlaying}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              {/if}
            </button>

            <button class="mp-icon-btn" on:click={playNext} aria-label="下一首">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5.5 6.2v11.6c0 .8.9 1.3 1.6.8l7.9-5.8c.6-.4.6-1.3 0-1.7L7.1 5.4c-.7-.5-1.6 0-1.6.8z"></path></svg>
            </button>

            <button id="mpb-list" class="mp-icon-btn mp-list-btn" on:click={toggleList} aria-label={isListOpen ? '收起歌单' : '打开歌单'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h12"></path><path d="M8 12h12"></path><path d="M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>
              <span>{isListOpen ? '收起歌单' : '看看歌单'}</span>
            </button>
          </div>

          {#if errorMessage}
            <p class="mp-status mp-error">{errorMessage}</p>
          {:else if loadState === 'loading'}
            <p class="mp-status">正在整理歌单…</p>
          {:else if loadState === 'empty'}
            <p class="mp-status">还没有可播放的歌。</p>
          {/if}

          <div class="mp-list-toolbar">
            <p class="text-[10px] font-black tracking-[0.08em] opacity-52">想换哪首</p>
            <p class="text-[10px] font-black tracking-[0.08em] opacity-45">一共 {filteredTracks.length} 首</p>
          </div>

          <div id="mp-list-area" class:show={isListOpen}>
            <div class="mp-search-wrap">
              <input
                id="mp-search"
                bind:value={search}
                type="text"
                placeholder="搜歌名或歌手"
                on:click|stopPropagation
                on:keydown|stopPropagation
              />
            </div>

            <div id="mp-list" class="mp-list" role="presentation" on:mousedown|stopPropagation on:touchstart|stopPropagation>
              {#if filteredTracks.length > 0}
                {#each filteredTracks as track, filteredIndex}
                  <button
                    class="mp-li {track.url === currentTrack.url ? 'active' : ''}"
                    on:click={(event) => handleTrackSelect(playlist.findIndex((item) => item.url === track.url), event)}
                  >
                    <span class="mp-li-meta">
                      <span class="mp-li-name">{track.name}</span>
                      <span class="mp-li-artist">{track.artist}</span>
                    </span>
                    {#if track.url === currentTrack.url}
                      <span class="mp-li-state">{isPlaying ? '正在听' : '就这首'}</span>
                    {:else}
                      <span class="mp-li-index">{String(filteredIndex + 1).padStart(2, '0')}</span>
                    {/if}
                  </button>
                {/each}
              {:else}
                <div class="mp-empty">这次没搜到，换个词试试</div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  #mp {
    border-radius: 999px;
    outline: none;
  }

  #mp.open {
    border-radius: 30px;
  }

  #mp:focus,
  #mp:focus-visible {
    outline: none;
  }

  #mp.dragging {
    box-shadow: var(--shadow-float-token);
    transition-duration: 0s;
  }

  .mp-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .mp-drag-handle {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    gap: 0.18rem;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: inherit;
    background: transparent;
    color: transparent;
    cursor: grab;
    touch-action: none;
    z-index: 5;
  }

  .mp-drag-handle:active {
    cursor: grabbing;
  }

  .mp-drag-handle span {
    width: 0.36rem;
    height: 0.12rem;
    border-radius: 999px;
    background: currentColor;
    opacity: 0;
  }

  .mp-drag-handle.open {
    top: 0.45rem;
    left: 50%;
    width: 4.25rem;
    height: 1.15rem;
    transform: translateX(-50%);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(245, 239, 224, 0.5);
  }

  .mp-drag-handle.open span {
    opacity: 0.8;
  }

  .mp-shell {
    background: rgba(var(--color-bg-rgb), 0.985);
    color: var(--color-text);
    backdrop-filter: blur(22px);
    border: 1px solid rgba(245, 239, 224, 0.12);
    box-shadow: var(--shadow-xl-token);
  }

  .mp-shell.closed {
    border-radius: 999px;
  }

  .mp-shell.open {
    border-radius: 30px;
  }

  .mp-main {
    position: relative;
    min-height: 3.75rem;
    padding: 0.35rem;
  }

  .mp-closed {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
  }

  .mp-badge {
    display: flex;
    height: 3rem;
    width: 3rem;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-bg);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }

  .mp-badge.large {
    height: 5.5rem;
    width: 5.5rem;
    border-radius: 24px;
  }

  .mp-content {
    padding: 1.65rem 0.75rem 0.75rem;
  }

  .mp-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .mp-kicker {
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    opacity: 0.74;
  }

  .mp-topline-copy {
    margin-top: 0.18rem;
    font-size: 0.72rem;
    font-weight: 600;
    opacity: 0.54;
  }

  .mp-collapse-btn {
    height: 2rem;
    min-width: 2rem;
  }

  .mp-hero {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 0.9rem;
    margin-top: 0.9rem;
    padding: 0.95rem;
    border-radius: 26px;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.16), transparent 44%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(245, 239, 224, 0.12);
  }

  .mp-cover-card {
    position: relative;
    box-shadow: 0 18px 34px rgba(var(--shadow-rgb), 0.18);
  }

  .mp-cover-card::after {
    content: '';
    position: absolute;
    inset: auto 0.55rem -0.55rem;
    height: 0.65rem;
    border-radius: 999px;
    background: rgba(var(--shadow-rgb), 0.2);
    filter: blur(10px);
    z-index: -1;
  }

  .mp-hero-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .mp-hero-eyebrow {
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    opacity: 0.58;
  }

  .mp-track-title {
    margin-top: 0.26rem;
    font-size: 1.08rem;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .mp-track-artist {
    margin-top: 0.32rem;
    font-size: 0.76rem;
    font-weight: 800;
    opacity: 0.68;
  }

  .mp-hero-note {
    margin-top: 0.42rem;
    font-size: 0.76rem;
    line-height: 1.45;
    font-weight: 600;
    opacity: 0.62;
  }

  .mp-meta-row {
    margin-top: 0.65rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    opacity: 0.68;
  }

  .mp-meta-row span {
    border-radius: 999px;
    border: 1px solid rgba(245, 239, 224, 0.12);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.32rem 0.55rem;
  }

  .mp-queue-panel {
    margin-top: 0.85rem;
    padding: 0.8rem;
    border-radius: 22px;
    border: 1px solid rgba(245, 239, 224, 0.1);
    background: rgba(255, 255, 255, 0.04);
  }

  .mp-queue-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.55rem;
  }

  .mp-queue-chip {
    border-radius: 999px;
    border: 1px solid rgba(245, 239, 224, 0.12);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.45rem 0.75rem;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: inherit;
  }

  .mp-progress-card {
    margin-top: 0.85rem;
    padding: 0.85rem 0.9rem;
    border-radius: 22px;
    border: 1px solid rgba(245, 239, 224, 0.1);
    background: rgba(255, 255, 255, 0.035);
  }

  .mp-progress-wrap {
    position: relative;
  }

  .mp-progress-bar {
    height: 0.45rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .mp-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--color-primary), rgba(255, 255, 255, 0.9));
    transition: width 0.15s linear;
  }

  .mp-progress-input {
    position: absolute;
    inset: -0.35rem 0 auto 0;
    width: 100%;
    height: 1rem;
    opacity: 0;
    cursor: pointer;
  }

  .mp-time-row {
    margin-top: 0.45rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    opacity: 0.62;
  }

  .mp-actions {
    display: flex;
    align-items: center;
    gap: 0.38rem;
    margin-top: 0.9rem;
    flex-wrap: nowrap;
  }

  .mp-icon-btn {
    display: inline-flex;
    height: 2.35rem;
    min-width: 2.35rem;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(245, 239, 224, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .mp-icon-btn:hover {
    transform: scale(1.05);
    border-color: rgba(245, 239, 224, 0.22);
  }

  .mp-play-btn {
    background: var(--color-primary);
    color: var(--color-bg);
    border-color: transparent;
    box-shadow: 0 14px 26px rgba(var(--shadow-rgb), 0.18);
  }

  .mp-list-btn {
    margin-left: auto;
    padding: 0 0.9rem;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  .mp-status {
    margin-top: 0.7rem;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.45;
    opacity: 0.68;
  }

  .mp-error {
    color: #fca5a5;
    opacity: 1;
  }

  .mp-list-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.9rem;
  }

  .mp-list-toolbar.compact {
    margin-top: 0;
  }

  #mp-list-area {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.28s ease, opacity 0.22s ease, margin-top 0.22s ease;
  }

  #mp-list-area.show {
    max-height: 21rem;
    overflow: auto;
    opacity: 1;
    margin-top: 0.65rem;
  }

  .mp-search-wrap {
    border: 1px solid rgba(245, 239, 224, 0.12);
    border-radius: 18px;
    background: rgba(var(--color-bg-rgb), 0.995);
    padding: 0.45rem 0.75rem;
  }

  .mp-search-wrap input {
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;
    outline: none;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .mp-search-wrap input::placeholder {
    color: rgba(245, 239, 224, 0.38);
  }

  .mp-list {
    margin-top: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-right: 0.1rem;
  }

  .mp-li {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    border-radius: 18px;
    border: 1px solid rgba(245, 239, 224, 0.08);
    background: rgba(255, 255, 255, 0.03);
    padding: 0.8rem 0.85rem;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    color: inherit;
  }

  .mp-li:hover {
    transform: translateY(-1px);
    border-color: rgba(245, 239, 224, 0.16);
  }

  .mp-li.active {
    border-color: rgba(245, 239, 224, 0.28);
    background: rgba(255, 255, 255, 0.07);
  }

  .mp-li-meta {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .mp-li-name {
    font-size: 0.8rem;
    font-weight: 800;
    line-height: 1.15;
  }

  .mp-li-artist {
    margin-top: 0.2rem;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.48;
  }

  .mp-li-state,
  .mp-li-index {
    flex-shrink: 0;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    opacity: 0.54;
  }

  .mp-empty {
    padding: 1rem 0.25rem;
    text-align: center;
    font-size: 0.78rem;
    font-weight: 700;
    opacity: 0.58;
  }

  @media (max-width: 768px) {
    .mp-content {
      padding: 1.45rem 0.5rem 0.5rem;
    }

    .mp-hero {
      grid-template-columns: 1fr;
    }

    .mp-cover-card {
      width: 5rem;
      height: 5rem;
    }

    .mp-actions {
      flex-wrap: wrap;
    }

    .mp-list-btn {
      margin-left: 0;
      width: 100%;
      justify-content: center;
    }
  }
</style>
