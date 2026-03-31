<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, tick } from 'svelte';

  type Track = {
    name: string;
    artist: string;
    url: string;
    cover?: string | null;
  };

  type PanelEdge = 'left' | 'right';
  type PanelVerticalEdge = 'top' | 'bottom';

  const FALLBACK_TRACK: Track = {
    name: '正在找歌',
    artist: '稍等一下，马上就好',
    url: '',
    cover: null
  };
  const PANEL_MARGIN = 12;
  const CLOSED_PANEL_SIZE_REM = 3.75;
  const OPEN_PANEL_WIDTH_REM = 18.75;
  const OPEN_PANEL_HEIGHT_ESTIMATE_REM = 24.875;
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

  let panelLeft = 24;
  let panelTop = 24;
  let dockLeft = 24;
  let dockTop = 24;
  let panelOriginX: PanelEdge = 'right';
  let panelOriginY: PanelVerticalEdge = 'bottom';
  let panelReady = false;
  let isDraggingWidget = false;
  let dragPointerId: number | null = null;
  let dragCaptureEl: HTMLElement | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanelLeft = 0;
  let dragStartPanelTop = 0;
  let dragStartDockLeft = 0;
  let dragStartDockTop = 0;
  let dragMoved = false;
  let panelResyncTimer: ReturnType<typeof setTimeout> | null = null;

  $: filteredTracks = playlist.filter((track) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [track.name, track.artist].some((value) => String(value || '').toLowerCase().includes(needle));
  });

  $: currentTrack = playlist[currentIndex] || getFallbackTrack();

  $: if (audioEl && currentTrack.url && currentTrack.url !== lastBoundUrl) {
    bindTrackToAudio(currentTrack.url);
  }

  $: openMotionX = panelOriginX === 'right' ? 28 : -28;
  $: openMotionY = panelOriginY === 'bottom' ? 18 : -18;
  $: panelOriginXPercent = panelOriginX === 'right' ? '100%' : '0%';
  $: panelOriginYPercent = panelOriginY === 'bottom' ? '100%' : '0%';

  onMount(() => {
    void loadPlaylist();
    void initializePanelPosition();

    const handleResize = () => {
      void syncPanelPosition({ preserveOrigin: true });
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
    clearPanelResyncTimer();

    if (dragMoved) {
      dragMoved = false;
      return;
    }

    if (!isOpen) {
      syncClosedStateFromViewport();
      const closedWidth = getClosedPanelSize();
      const closedHeight = getClosedPanelHeight();
      resolvePanelOrigins(panelLeft, panelTop, closedWidth, closedHeight);
      syncDockFromPanel(closedWidth, closedHeight);
      const preservedDock = { left: dockLeft, top: dockTop };
      isOpen = true;
      await syncOpenPanelFromDock(preservedDock);
      return;
    }

    isOpen = false;

    if (!isOpen) {
      isListOpen = false;
      search = '';
    }

    await syncPanelPosition({ preserveOrigin: true });
  }

  async function collapsePlayer(event: Event) {
    event.stopPropagation();
    clearPanelResyncTimer();
    isOpen = false;
    isListOpen = false;
    search = '';
    await syncPanelPosition({ preserveOrigin: true });
  }

  function handleHandleClick(event: MouseEvent) {
    event.stopPropagation();

    if (dragMoved) {
      dragMoved = false;
      return;
    }

    if (isOpen) {
      void collapsePlayer(event);
      return;
    }

    void togglePlayer();
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
    clearPanelResyncTimer();
    if (!isOpen) {
      syncClosedStateFromViewport();
      const closedWidth = getClosedPanelSize();
      const closedHeight = getClosedPanelHeight();
      resolvePanelOrigins(panelLeft, panelTop, closedWidth, closedHeight);
      syncDockFromPanel(closedWidth, closedHeight);
      const preservedDock = { left: dockLeft, top: dockTop };
      isOpen = true;
      await syncOpenPanelFromDock(preservedDock);
      isListOpen = !isListOpen;
      await syncPanelPosition({ preserveOrigin: true });
      return;
    }
    isListOpen = !isListOpen;
    await syncPanelPosition({ preserveOrigin: true });
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

  function beginDragging(clientX: number, clientY: number, target: HTMLElement, pointerId?: number) {
    clearPanelResyncTimer();

    dragPointerId = typeof pointerId === 'number' ? pointerId : null;
    dragCaptureEl = target;
    dragOffsetX = clientX - panelLeft;
    dragOffsetY = clientY - panelTop;
    dragStartX = clientX;
    dragStartY = clientY;
    dragStartPanelLeft = panelLeft;
    dragStartPanelTop = panelTop;
    dragStartDockLeft = dockLeft;
    dragStartDockTop = dockTop;
    dragMoved = false;
    isDraggingWidget = true;

    if (typeof pointerId === 'number') {
      dragCaptureEl?.setPointerCapture(pointerId);
    }
  }

  async function syncPanelPosition(options: { reset?: boolean; preserveOrigin?: boolean; resync?: boolean } = {}) {
    await tick();
    if (typeof window === 'undefined') return;

    const { reset = false, preserveOrigin = false, resync = true } = options;
    const { width, height } = getPanelDimensions();

    if (!panelReady || reset) {
      dockLeft = getDefaultDockLeft();
      dockTop = getDefaultDockTop();
      panelReady = true;
    }

    if (!preserveOrigin) {
      resolvePanelOrigins();
    }

    clampDockToViewport(width, height);
    if (resync) {
      schedulePanelResync();
    }
  }

  async function syncOpenPanelFromDock(preservedDock = { left: dockLeft, top: dockTop }) {
    await tick();
    dockLeft = preservedDock.left;
    dockTop = preservedDock.top;
    const width = getPreferredPanelWidth(true);
    const height = getEstimatedOpenPanelHeight();
    clampDockToViewport(width, height);
    clearPanelResyncTimer();
  }

  async function initializePanelPosition() {
    await tick();
    await syncPanelPosition({ reset: true, preserveOrigin: true, resync: false });
  }

  function getRootFontSize() {
    if (typeof window === 'undefined') return 16;
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
    return Number.isFinite(rootFontSize) ? rootFontSize : 16;
  }

  function getClosedPanelSize() {
    return CLOSED_PANEL_SIZE_REM * getRootFontSize();
  }

  function getClosedPanelHeight() {
    return getClosedPanelSize() + 2;
  }

  function getPreferredPanelWidth(open = isOpen) {
    const rootFontSize = getRootFontSize();
    const compactWidth = getClosedPanelSize();
    if (!open || typeof window === 'undefined') return compactWidth;
    return Math.min(OPEN_PANEL_WIDTH_REM * rootFontSize, window.innerWidth - 24);
  }

  function getEstimatedOpenPanelHeight() {
    return OPEN_PANEL_HEIGHT_ESTIMATE_REM * getRootFontSize();
  }

  function syncClosedStateFromViewport() {
    if (!widgetEl || isOpen) return;

    const rect = widgetEl.getBoundingClientRect();
    const computed = getComputedStyle(widgetEl);
    const nextLeft = Number.isFinite(rect.left) ? rect.left : Number.parseFloat(computed.left || '');
    const nextTop = Number.isFinite(rect.top) ? rect.top : Number.parseFloat(computed.top || '');

    if (Number.isFinite(nextLeft)) {
      panelLeft = nextLeft;
    }

    if (Number.isFinite(nextTop)) {
      panelTop = nextTop;
    }
  }

  function getDefaultDockLeft() {
    if (typeof window === 'undefined') return PANEL_MARGIN;
    const size = getClosedPanelSize();
    return Math.max(PANEL_MARGIN, window.innerWidth - size - 24);
  }

  function getDefaultDockTop() {
    if (typeof window === 'undefined') return PANEL_MARGIN;
    const size = getClosedPanelSize();
    return Math.max(PANEL_MARGIN, window.innerHeight - size - 24);
  }

  function resolvePanelOrigins(
    referenceLeft = panelLeft,
    referenceTop = panelTop,
    referenceWidth = getPanelDimensions().width,
    referenceHeight = getPanelDimensions().height
  ) {
    if (typeof window === 'undefined') return;
    panelOriginX = referenceLeft + referenceWidth / 2 >= window.innerWidth / 2 ? 'right' : 'left';
    panelOriginY = referenceTop + referenceHeight / 2 >= window.innerHeight / 2 ? 'bottom' : 'top';
  }

  function getAnchoredPanelPosition(width: number, height: number) {
    const size = getClosedPanelSize();

    return {
      left: panelOriginX === 'right' ? dockLeft + size - width : dockLeft,
      top: panelOriginY === 'bottom' ? dockTop + size - height : dockTop
    };
  }

  function getPanelDimensions() {
    const closedWidth = getClosedPanelSize();
    const closedHeight = getClosedPanelHeight();

    if (!isOpen) {
      return {
        width: closedWidth,
        height: closedHeight
      };
    }

    if (!widgetEl) {
      return {
        width: getPreferredPanelWidth(true),
        height: closedHeight
      };
    }

    const rect = widgetEl.getBoundingClientRect();

    return {
      width: Math.max(rect.width || 0, getPreferredPanelWidth(true)),
      height: Math.max(rect.height || 0, closedHeight)
    };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
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
      void syncPanelPosition({ preserveOrigin: true, resync: false });
    }, PANEL_RESYNC_DELAY_MS);
  }

  function clampDockToViewport(width = getPanelDimensions().width, height = getPanelDimensions().height) {
    if (typeof window === 'undefined') return;

    const closedSize = getClosedPanelSize();
    const minDockLeft = panelOriginX === 'right' ? PANEL_MARGIN + width - closedSize : PANEL_MARGIN;
    const maxDockLeft = panelOriginX === 'right'
      ? window.innerWidth - closedSize - PANEL_MARGIN
      : window.innerWidth - width - PANEL_MARGIN;
    const minDockTop = panelOriginY === 'bottom' ? PANEL_MARGIN + height - closedSize : PANEL_MARGIN;
    const maxDockTop = panelOriginY === 'bottom'
      ? window.innerHeight - closedSize - PANEL_MARGIN
      : window.innerHeight - height - PANEL_MARGIN;

    dockLeft = clamp(dockLeft, minDockLeft, Math.max(minDockLeft, maxDockLeft));
    dockTop = clamp(dockTop, minDockTop, Math.max(minDockTop, maxDockTop));

    const anchored = getAnchoredPanelPosition(width, height);
    panelLeft = anchored.left;
    panelTop = anchored.top;
  }

  function clampActualPanelPosition(nextLeft: number, nextTop: number, width: number, height: number) {
    if (typeof window === 'undefined') {
      return { left: nextLeft, top: nextTop };
    }

    const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
    const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);

    return {
      left: clamp(nextLeft, PANEL_MARGIN, maxLeft),
      top: clamp(nextTop, PANEL_MARGIN, maxTop)
    };
  }

  function syncDockFromPanel(width: number, height: number) {
    const closedSize = getClosedPanelSize();
    dockLeft = panelOriginX === 'right' ? panelLeft + width - closedSize : panelLeft;
    dockTop = panelOriginY === 'bottom' ? panelTop + height - closedSize : panelTop;
  }

  function handleDragPointerDown(event: PointerEvent) {
    if (!widgetEl || !isOpen) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    beginDragging(event.clientX, event.clientY, event.currentTarget as HTMLElement, event.pointerId);
  }

  function handleDragMouseDown(event: MouseEvent) {
    if (!widgetEl || !isOpen || isDraggingWidget || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    beginDragging(event.clientX, event.clientY, event.currentTarget as HTMLElement);
  }

  function handleDragPointerMove(event: PointerEvent) {
    if (!isDraggingWidget || event.pointerId !== dragPointerId) return;
    event.preventDefault();

    const totalTravel = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
    if (!dragMoved && totalTravel <= 6) {
      return;
    }

    const { width, height } = getPanelDimensions();
    const nextLeft = event.clientX - dragOffsetX;
    const nextTop = event.clientY - dragOffsetY;
    const nextPosition = clampActualPanelPosition(nextLeft, nextTop, width, height);

    dragMoved = true;

    panelLeft = nextPosition.left;
    panelTop = nextPosition.top;
    syncDockFromPanel(width, height);
  }

  function handleDragMouseMove(event: MouseEvent) {
    if (!isDraggingWidget || dragPointerId !== null) return;

    const totalTravel = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
    if (!dragMoved && totalTravel <= 6) {
      return;
    }

    const { width, height } = getPanelDimensions();
    const nextLeft = event.clientX - dragOffsetX;
    const nextTop = event.clientY - dragOffsetY;
    const nextPosition = clampActualPanelPosition(nextLeft, nextTop, width, height);

    dragMoved = true;

    panelLeft = nextPosition.left;
    panelTop = nextPosition.top;
    syncDockFromPanel(width, height);
  }

  function finishDragging(event?: PointerEvent | MouseEvent) {
    if (event && 'pointerId' in event && dragPointerId !== null && event.pointerId !== dragPointerId) return;

    if (dragCaptureEl && dragPointerId !== null) {
      try {
        dragCaptureEl.releasePointerCapture(dragPointerId);
      } catch {}
    }

    dragPointerId = null;
    dragCaptureEl = null;
    isDraggingWidget = false;

    if (!dragMoved) {
      panelLeft = dragStartPanelLeft;
      panelTop = dragStartPanelTop;
      dockLeft = dragStartDockLeft;
      dockTop = dragStartDockTop;
    }

    if (dragMoved) {
      const { width, height } = getPanelDimensions();
      resolvePanelOrigins(panelLeft, panelTop, width, height);
      syncDockFromPanel(width, height);
    }

    schedulePanelResync();
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
  on:mousemove={handleDragMouseMove}
  on:mouseup={finishDragging}
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
  data-origin-x={panelOriginX}
  data-origin-y={panelOriginY}
  class="fixed z-[10050] overflow-visible transition-[left,top,width,height,box-shadow,transform] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
  style="left: {panelLeft}px; top: {panelTop}px; width: {isOpen ? 'min(18.75rem, calc(100vw - 1rem))' : '3.75rem'}; --mp-open-x: {openMotionX}px; --mp-open-y: {openMotionY}px; --mp-origin-x: {panelOriginXPercent}; --mp-origin-y: {panelOriginYPercent};"
  on:click={() => !isOpen && togglePlayer()}
  on:keydown={(event) => !isOpen && event.key === 'Enter' && togglePlayer()}
  role="button"
  tabindex="0"
>
  {#if isOpen}
    <button
      id="mp-drag-handle"
      class:open={isOpen}
      class="mp-drag-handle"
      type="button"
      aria-label="Drag music player"
      on:click={handleHandleClick}
      on:mousedown={handleDragMouseDown}
      on:pointerdown={handleDragPointerDown}
      on:pointermove={handleDragPointerMove}
      on:pointerup={finishDragging}
      on:pointercancel={finishDragging}
    >
      <span></span>
      <span></span>
      <span></span>
      <small class="mp-drag-label">拖动 / 收起</small>
    </button>
  {/if}

  <div class="mp-shell {isOpen ? 'open' : 'closed'}">
    <div class="mp-main">
      <p id="mp-name" class="mp-sr-only">{currentTrack.name}</p>

      {#if !isOpen}
        <div class="mp-closed" in:fade|local={{ duration: 160 }}>
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
        <div class="mp-content" in:fly|local={{ x: openMotionX, y: openMotionY, duration: 320 }}>
          <div class="mp-topline">
            <div>
              <p class="mp-kicker">随手听歌</p>
              <p class="mp-topline-copy">按住上面的横杆，整块都能拖着走。</p>
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
            <span class="mp-actions-balance" aria-hidden="true"></span>

            <div class="mp-transport">
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
            </div>

            <button
              id="mpb-list"
              class="mp-icon-btn mp-list-btn {isListOpen ? 'is-open' : ''}"
              on:click={toggleList}
              aria-label={isListOpen ? '收起歌单' : '打开歌单'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h12"></path><path d="M8 12h12"></path><path d="M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>
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
            <p class="text-[10px] font-black tracking-[0.08em] opacity-52">全部曲目</p>
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
    --mp-open-x: 0px;
    --mp-open-y: 0px;
    --mp-origin-x: 100%;
    --mp-origin-y: 100%;
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
    top: 0.55rem;
    left: 0.6rem;
    right: 3.25rem;
    width: auto;
    height: 1.55rem;
    transform: none;
    border-radius: 999px;
    justify-content: flex-start;
    padding: 0 0.8rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
    color: rgba(245, 239, 224, 0.5);
  }

  .mp-drag-handle.open span {
    opacity: 0.8;
  }

  .mp-drag-label {
    display: block;
    margin-left: 0.42rem;
    font-size: 0.56rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .mp-shell {
    position: relative;
    overflow: hidden;
    background: rgba(var(--color-bg-rgb), 0.985);
    color: var(--color-text);
    backdrop-filter: blur(22px);
    border: 1px solid rgba(245, 239, 224, 0.12);
    box-shadow: var(--shadow-xl-token);
    transform-origin: var(--mp-origin-x) var(--mp-origin-y);
    transition: border-radius 0.34s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.34s ease, border-color 0.34s ease, background 0.34s ease;
  }

  .mp-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.14), transparent 40%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 38%);
    opacity: 0;
    pointer-events: none;
    transform: translate3d(calc(var(--mp-open-x) * -0.45), calc(var(--mp-open-y) * -0.35), 0);
    transition: opacity 0.32s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  }

  #mp.open .mp-shell::after {
    opacity: 0.92;
    transform: translate3d(0, 0, 0);
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
    height: 4.75rem;
    width: 4.75rem;
    border-radius: 20px;
  }

  .mp-content {
    padding: 2.35rem 0.62rem 0.62rem;
    will-change: transform, opacity;
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
    font-size: 0.68rem;
    font-weight: 600;
    opacity: 0.54;
  }

  .mp-collapse-btn {
    height: 2rem;
    min-width: 2rem;
  }

  .mp-hero {
    display: grid;
    grid-template-columns: 4.75rem minmax(0, 1fr);
    gap: 0.72rem;
    margin-top: 0.72rem;
    padding: 0.78rem;
    border-radius: 22px;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.16), transparent 44%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(245, 239, 224, 0.12);
  }

  .mp-cover-card {
    position: relative;
    box-shadow: 0 14px 28px rgba(var(--shadow-rgb), 0.16);
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
    font-size: 0.98rem;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .mp-track-artist {
    margin-top: 0.24rem;
    font-size: 0.72rem;
    font-weight: 800;
    opacity: 0.68;
  }

  .mp-hero-note {
    margin-top: 0.3rem;
    font-size: 0.7rem;
    line-height: 1.42;
    font-weight: 600;
    opacity: 0.62;
  }

  .mp-meta-row {
    margin-top: 0.52rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    font-size: 0.58rem;
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

  .mp-progress-card {
    margin-top: 0.72rem;
    padding: 0.75rem 0.8rem;
    border-radius: 20px;
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
    margin-top: 0.38rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    opacity: 0.62;
  }

  .mp-actions {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.62rem;
    margin-top: 0.8rem;
  }

  .mp-actions-balance {
    justify-self: stretch;
  }

  .mp-transport {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
  }

  .mp-icon-btn {
    display: inline-flex;
    height: 2.2rem;
    min-width: 2.2rem;
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
    height: 2.7rem;
    min-width: 2.7rem;
    background: var(--color-primary);
    color: var(--color-bg);
    border-color: transparent;
    box-shadow: 0 14px 26px rgba(var(--shadow-rgb), 0.18);
  }

  .mp-list-btn {
    justify-self: end;
    padding: 0;
  }

  .mp-list-btn.is-open {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(245, 239, 224, 0.24);
  }

  .mp-status {
    margin-top: 0.62rem;
    font-size: 0.66rem;
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
    margin-top: 0.75rem;
  }

  #mp-list-area {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    margin-top: 0;
    padding-right: 0.05rem;
    pointer-events: none;
    transform: translate3d(calc(var(--mp-open-x) * 0.16), calc(var(--mp-open-y) * 0.16), 0) scale(0.97);
    transition: max-height 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.22s ease;
  }

  #mp-list-area.show {
    max-height: 18rem;
    overflow: auto;
    opacity: 1;
    margin-top: 0.58rem;
    padding: 0.55rem;
    pointer-events: auto;
    transform: translate3d(0, 0, 0) scale(1);
    background: rgb(var(--color-bg-rgb));
    border: 1px solid rgba(245, 239, 224, 0.08);
    border-radius: 20px;
  }

  .mp-search-wrap {
    border: 1px solid rgba(245, 239, 224, 0.12);
    border-radius: 18px;
    background: rgb(var(--color-bg-rgb));
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
    margin-top: 0.58rem;
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
      padding: 2.2rem 0.5rem 0.5rem;
    }

    .mp-hero {
      grid-template-columns: 1fr;
    }

    .mp-cover-card {
      width: 5rem;
      height: 5rem;
    }

    .mp-actions {
      grid-template-columns: 1fr auto;
    }

    .mp-actions-balance {
      display: none;
    }
  }
</style>
