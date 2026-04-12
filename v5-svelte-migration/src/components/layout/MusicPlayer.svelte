<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Track = {
    name: string;
    artist: string;
    url: string;
    cover?: string | null;
  };

  type CoverPalette = {
    start: string;
    end: string;
    accent: string;
    glow: string;
  };

  type AnchorX = 'left' | 'right';
  type AnchorY = 'top' | 'bottom';

  const FALLBACK_TRACK: Track = {
    name: '正在找歌',
    artist: '稍等一下，马上就好',
    url: '',
    cover: null
  };

  const PANEL_MARGIN = 12;
  const CLOSED_SIZE_REM = 4;
  const OPEN_WIDTH_REM = 21.25;
  const OPEN_BASE_HEIGHT_REM = 24.5;
  const OPEN_LIST_EXTRA_REM = 0;
  const DRAG_THRESHOLD = 10;
  const DRAG_THRESHOLD_MOBILE = 18;
  const AUTOPLAY_UNLOCK_EVENTS = ['pointerdown', 'keydown'] as const;

  let audioEl: HTMLAudioElement;
  let widgetEl: HTMLDivElement;
  let dragCaptureEl: HTMLElement | null = null;

  let isOpen = false;
  let isListOpen = false;
  let isPlaying = false;
  let isDragging = false;
  let isDragArmed = false;
  let dragMoved = false;
  let pendingAutoplayUnlock = false;

  let loadState: 'loading' | 'ready' | 'empty' | 'error' = 'loading';
  let errorMessage = '';
  let search = '';
  let playlist: Track[] = [];
  let currentIndex = 0;
  let filteredTracks: Track[] = [];
  let currentTrack: Track = FALLBACK_TRACK;
  let currentTrackMonogram = '♪';
  let currentTrackCoverPalette: CoverPalette = getTrackCoverPalette(FALLBACK_TRACK);
  let currentTrackCoverStyle = buildTrackCoverStyle(currentTrackCoverPalette);

  let panelLeft = typeof window === 'undefined' ? PANEL_MARGIN : getDefaultClosedPosition().left;
  let panelTop = typeof window === 'undefined' ? PANEL_MARGIN : getDefaultClosedPosition().top;
  let panelAnchorX: AnchorX = 'right';
  let panelAnchorY: AnchorY = 'bottom';
  let dragPointerId: number | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let suppressClickUntil = 0;
  let lastBoundUrl = '';

  let progress = 0;
  let duration = 0;
  let currentTime = 0;

  $: filteredTracks = playlist.filter((track) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [track.name, track.artist].some((value) => String(value || '').toLowerCase().includes(needle));
  });

  $: currentTrack = playlist[currentIndex] || getFallbackTrack();
  $: currentTrackMonogram = getTrackMonogram(currentTrack);
  $: currentTrackCoverPalette = getTrackCoverPalette(currentTrack);
  $: currentTrackCoverStyle = buildTrackCoverStyle(currentTrackCoverPalette);

  $: if (audioEl && currentTrack.url && currentTrack.url !== lastBoundUrl) {
    bindTrackToAudio(currentTrack.url);
  }

  onMount(() => {
    syncPanelToViewport();
    void loadPlaylist();

    const handleResize = () => {
      syncPanelToViewport();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      removeAutoplayUnlockListeners();
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

  function normalizeTrack(track: unknown, index: number): Track | null {
    if (!track || typeof track !== 'object') return null;
    const candidate = track as Record<string, unknown>;
    const url = String(candidate.url || '').trim();
    if (!url) return null;

    return {
      name: String(candidate.name || '').trim() || `第 ${index + 1} 首`,
      artist: String(candidate.artist || '').trim() || '未署名歌手',
      url,
      cover: String(candidate.cover || '').trim() || null
    };
  }

  function hashString(value: string) {
    let hash = 0;

    for (const character of String(value || '')) {
      hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }

    return Math.abs(hash);
  }

  function toHsl(hue: number, saturation: number, lightness: number) {
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }

  function getTrackMonogram(track: Track) {
    const parts = [track?.name, track?.artist]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .flatMap((value) => value.split(/[\s\-_/]+/).filter(Boolean));

    if (parts.length >= 2) {
      const first = Array.from(parts[0])[0] || '';
      const second = Array.from(parts[1])[0] || '';
      return `${first}${second}`.toUpperCase();
    }

    const fallbackChars = Array.from(parts[0] || String(track?.name || '').trim());
    if (fallbackChars.length >= 2) {
      return `${fallbackChars[0]}${fallbackChars[1]}`.toUpperCase();
    }

    return (fallbackChars[0] || '♪').toUpperCase();
  }

  function getTrackCoverPalette(track: Track): CoverPalette {
    const seed = hashString(`${track?.name || ''}::${track?.artist || ''}`);
    const hue = seed % 360;

    return {
      start: toHsl((hue + 18) % 360, 76, 58),
      end: toHsl((hue + 92) % 360, 72, 48),
      accent: toHsl((hue + 160) % 360, 92, 82),
      glow: toHsl((hue + 230) % 360, 78, 72)
    };
  }

  function buildTrackCoverStyle(palette: CoverPalette) {
    return [
      `--mp-cover-start: ${palette.start}`,
      `--mp-cover-end: ${palette.end}`,
      `--mp-cover-accent: ${palette.accent}`,
      `--mp-cover-glow: ${palette.glow}`
    ].join('; ');
  }

  function getRootFontSize() {
    if (typeof window === 'undefined') return 16;
    const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
    return Number.isFinite(size) ? size : 16;
  }

  function getClosedSize() {
    return CLOSED_SIZE_REM * getRootFontSize();
  }

  function getOpenWidth() {
    if (typeof window === 'undefined') return OPEN_WIDTH_REM * getRootFontSize();
    return Math.min(OPEN_WIDTH_REM * getRootFontSize(), window.innerWidth - PANEL_MARGIN * 2);
  }

  function getOpenHeight() {
    const preferred = OPEN_BASE_HEIGHT_REM * getRootFontSize();
    if (typeof window === 'undefined') return preferred;
    return Math.min(preferred, window.innerHeight - PANEL_MARGIN * 2);
  }

  function getPanelSize(open = isOpen, listOpen = isListOpen) {
    if (!open) {
      const size = getClosedSize();
      return { width: size, height: size };
    }

    return {
      width: getOpenWidth(),
      height: getOpenHeight(listOpen)
    };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function clampPosition(left: number, top: number, width: number, height: number) {
    if (typeof window === 'undefined') {
      return { left, top };
    }

    const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
    const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);

    return {
      left: clamp(left, PANEL_MARGIN, maxLeft),
      top: clamp(top, PANEL_MARGIN, maxTop)
    };
  }

  function getDefaultClosedPosition() {
    if (typeof window === 'undefined') {
      return { left: PANEL_MARGIN, top: PANEL_MARGIN };
    }

    const size = getClosedSize();

    return {
      left: Math.max(PANEL_MARGIN, window.innerWidth - size - PANEL_MARGIN),
      top: Math.max(PANEL_MARGIN, window.innerHeight - size - PANEL_MARGIN)
    };
  }

  function syncAnchor(left = panelLeft, top = panelTop, width = getPanelSize().width, height = getPanelSize().height) {
    if (typeof window === 'undefined') return;

    panelAnchorX = left + width / 2 >= window.innerWidth / 2 ? 'right' : 'left';
    panelAnchorY = top + height / 2 >= window.innerHeight / 2 ? 'bottom' : 'top';
  }

  function syncPanelToViewport() {
    const { width, height } = getPanelSize(isOpen, isListOpen);
    const next = clampPosition(panelLeft, panelTop, width, height);
    panelLeft = next.left;
    panelTop = next.top;
    syncAnchor(panelLeft, panelTop, width, height);
  }

  function measurePanelRect() {
    if (!widgetEl) {
      return getPanelSize(isOpen, isListOpen);
    }

    const rect = widgetEl.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function getOpenPositionFromAnchor(fromLeft = panelLeft, fromTop = panelTop, listOpen = isListOpen) {
    const closed = getPanelSize(false);
    const open = getPanelSize(true, listOpen);
    const nextLeft = panelAnchorX === 'right' ? fromLeft + closed.width - open.width : fromLeft;
    const nextTop = panelAnchorY === 'bottom' ? fromTop + closed.height - open.height : fromTop;

    return clampPosition(nextLeft, nextTop, open.width, open.height);
  }

  function getClosedPositionFromAnchor(fromLeft = panelLeft, fromTop = panelTop, listOpen = isListOpen) {
    const closed = getPanelSize(false);
    const open = getPanelSize(true, listOpen);
    const nextLeft = panelAnchorX === 'right' ? fromLeft + open.width - closed.width : fromLeft;
    const nextTop = panelAnchorY === 'bottom' ? fromTop + open.height - closed.height : fromTop;

    return clampPosition(nextLeft, nextTop, closed.width, closed.height);
  }

  function getPanelInlineStyle(pLeft: number, pTop: number, open: boolean, listOpen: boolean, aX: string, aY: string) {
    const { width, height } = getPanelSize(open, listOpen);
    const originX = aX === 'right' ? '100%' : '0%';
    const originY = aY === 'bottom' ? '100%' : '0%';

    return [
      `left: ${pLeft}px`,
      `top: ${pTop}px`,
      `width: ${width}px`,
      `height: ${height}px`,
      `--mp-origin-x: ${originX}`,
      `--mp-origin-y: ${originY}`
    ].join('; ');
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
      await tick();
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
    }
  }

  function resetAudioElement() {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  }

  function removeAutoplayUnlockListeners() {
    if (typeof window === 'undefined') return;

    AUTOPLAY_UNLOCK_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, handleAutoplayUnlock);
    });
  }

  function queueAutoplayUnlock() {
    if (typeof window === 'undefined' || pendingAutoplayUnlock || !currentTrack.url) return;

    pendingAutoplayUnlock = true;
    AUTOPLAY_UNLOCK_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleAutoplayUnlock, { once: true });
    });
  }

  async function handleAutoplayUnlock() {
    pendingAutoplayUnlock = false;
    removeAutoplayUnlockListeners();
    await playCurrent({ silent: true });
  }

  async function attemptAutoplayForCurrentTrack() {
    if (!audioEl || !currentTrack.url) return;

    if (lastBoundUrl !== currentTrack.url) {
      bindTrackToAudio(currentTrack.url);
      await tick();
    }

    await playCurrent({ silent: true });
  }

  function bindTrackToAudio(url: string, autoplay = false, silentAutoplay = false) {
    if (!audioEl || !url) return;

    lastBoundUrl = url;
    progress = 0;
    currentTime = 0;
    duration = 0;
    audioEl.src = url;
    audioEl.load();

    if (autoplay) {
      void playCurrent({ silent: silentAutoplay });
    }
  }

  async function playCurrent(options: { silent?: boolean } = {}) {
    if (!audioEl || !currentTrack.url) return;

    errorMessage = '';

    try {
      await audioEl.play();
      isPlaying = true;
      pendingAutoplayUnlock = false;
      removeAutoplayUnlockListeners();
    } catch (error) {
      console.error('Audio playback failed', error);
      isPlaying = false;

      if (options.silent) {
        queueAutoplayUnlock();
        return;
      }

      errorMessage = '这首歌现在放不了，换一首试试。';
    }
  }

  function pauseCurrent() {
    if (!audioEl) return;
    audioEl.pause();
    isPlaying = false;
  }

  function selectTrack(index: number, autoplay = true) {
    if (!playlist[index]) return;

    currentIndex = index;
    errorMessage = '';
    lastBoundUrl = '';
    bindTrackToAudio(playlist[index].url, autoplay, false);
  }

  function playNext(event?: Event, autoplay = true) {
    if (event && shouldCancelControlClick(event)) return;

    if (!playlist.length) return;
    const nextIndex = (currentIndex + 1) % playlist.length;
    selectTrack(nextIndex, autoplay);
  }

  function playPrevious(event?: Event, autoplay = true) {
    if (event && shouldCancelControlClick(event)) return;

    if (!playlist.length) return;
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    selectTrack(prevIndex, autoplay);
  }

  function handleTrackSelect(index: number, event: Event) {
    if (shouldCancelControlClick(event)) return;
    selectTrack(index, true);
  }

  function togglePlay(event: Event) {
    if (shouldCancelControlClick(event)) return;

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
    pauseCurrent();
    progress = 0;
    currentTime = 0;

    if (audioEl) {
      audioEl.currentTime = 0;
    }
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

  async function openPlayer(showList = false) {
    if (isOpen) return;

    const closed = getPanelSize(false);
    const closedPosition = clampPosition(panelLeft, panelTop, closed.width, closed.height);
    panelLeft = closedPosition.left;
    panelTop = closedPosition.top;
    syncAnchor(panelLeft, panelTop, closed.width, closed.height);

    isListOpen = showList;
    isOpen = true;

    const openPosition = getOpenPositionFromAnchor(closedPosition.left, closedPosition.top, showList);
    panelLeft = openPosition.left;
    panelTop = openPosition.top;
    syncAnchor(panelLeft, panelTop, getPanelSize(true, showList).width, getPanelSize(true, showList).height);
  }

  async function closePlayer() {
    if (!isOpen) return;

    const open = getPanelSize(true, isListOpen);
    syncAnchor(panelLeft, panelTop, open.width, open.height);

    const closedPosition = getClosedPositionFromAnchor(panelLeft, panelTop, isListOpen);
    isOpen = false;
    isListOpen = false;
    search = '';
    panelLeft = closedPosition.left;
    panelTop = closedPosition.top;
    syncAnchor(panelLeft, panelTop, getPanelSize(false).width, getPanelSize(false).height);
  }

  async function togglePlayerFromBubble(event?: Event) {
    if (event && shouldCancelControlClick(event)) return;
    await openPlayer(false);
  }

  async function toggleList(event: Event) {
    if (shouldCancelControlClick(event)) return;

    if (!isOpen) {
      await openPlayer(true);
      return;
    }

<<<<<<< HEAD
    const previousRect = measurePanelRect();
=======
>>>>>>> origin/main
    const nextListOpen = !isListOpen;

    isListOpen = nextListOpen;
    search = nextListOpen ? search : '';

    await tick();

    const nextRect = measurePanelRect();
<<<<<<< HEAD
    let nextLeft = panelLeft;
    let nextTop = panelTop;

    if (panelAnchorX === 'right') {
      nextLeft += previousRect.width - nextRect.width;
    }

    if (panelAnchorY === 'bottom') {
      nextTop += previousRect.height - nextRect.height;
    }

    const clamped = clampPosition(nextLeft, nextTop, nextRect.width, nextRect.height);
=======
    const clamped = clampPosition(panelLeft, panelTop, nextRect.width, nextRect.height);
>>>>>>> origin/main
    panelLeft = clamped.left;
    panelTop = clamped.top;
    syncAnchor(panelLeft, panelTop, nextRect.width, nextRect.height);
  }

  function beginDragging(clientX: number, clientY: number, target: HTMLElement, pointerId?: number) {
    if (!widgetEl) return;

    dragPointerId = typeof pointerId === 'number' ? pointerId : null;
    dragCaptureEl = target;
    dragOffsetX = clientX - panelLeft;
    dragOffsetY = clientY - panelTop;
    dragStartX = clientX;
    dragStartY = clientY;
    dragStartLeft = panelLeft;
    dragStartTop = panelTop;
    dragMoved = false;
    isDragArmed = true;
    isDragging = false;

    if (dragPointerId !== null) {
      dragCaptureEl?.setPointerCapture(dragPointerId);
    }
  }

  function handleDragPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    beginDragging(event.clientX, event.clientY, event.currentTarget as HTMLElement, event.pointerId);
  }

<<<<<<< HEAD
  function handleDragHandleClick(event: Event) {
    if (shouldCancelControlClick(event)) return;
    if (isOpen) {
      void closePlayer();
    }
=======
  function handleDragMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    beginDragging(event.clientX, event.clientY, event.currentTarget as HTMLElement);
>>>>>>> origin/main
  }

  function handleDragHandleClick(event: Event) {
    if (shouldCancelControlClick(event)) return;
    if (isOpen) {
      void closePlayer();
    }
  }

  function handleGlobalPointerMove(event: PointerEvent) {
    if ((!isDragArmed && !isDragging) || dragPointerId !== event.pointerId) return;

    const travel = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
    const threshold = event.pointerType === 'touch' ? DRAG_THRESHOLD_MOBILE : DRAG_THRESHOLD;

    if (!dragMoved && travel <= threshold) return;

    if (!dragMoved) {
      dragMoved = true;
      isDragging = true;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const { width, height } = getPanelSize(isOpen, isListOpen);
    const next = clampPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY, width, height);
    panelLeft = next.left;
    panelTop = next.top;
  }

<<<<<<< HEAD
=======
  function handleGlobalMouseMove(event: MouseEvent) {
    if ((!isDragArmed && !isDragging) || dragPointerId !== null) return;

    const travel = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
    if (!dragMoved && travel <= DRAG_THRESHOLD) return;

    dragMoved = true;
    isDragging = true;

    const { width, height } = getPanelSize(isOpen, isListOpen);
    const next = clampPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY, width, height);
    panelLeft = next.left;
    panelTop = next.top;
  }

>>>>>>> origin/main
  function finishDragging(event?: PointerEvent | MouseEvent) {
    if (!isDragArmed && !isDragging) return;
    if (event && 'pointerId' in event && dragPointerId !== null && event.pointerId !== dragPointerId) return;

    let didDrag = dragMoved;

    if (!didDrag && event) {
      const travel = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
      const threshold = 'pointerType' in event && event.pointerType === 'touch' ? DRAG_THRESHOLD_MOBILE : DRAG_THRESHOLD;

      if (travel > threshold) {
        didDrag = true;
        const { width, height } = getPanelSize(isOpen, isListOpen);
        const next = clampPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY, width, height);
        panelLeft = next.left;
        panelTop = next.top;
      }
    }

    if (dragCaptureEl && dragPointerId !== null) {
      try {
        dragCaptureEl.releasePointerCapture(dragPointerId);
      } catch {}
    }

    if (didDrag) {
      const { width, height } = getPanelSize(isOpen, isListOpen);
      syncAnchor(panelLeft, panelTop, width, height);
      suppressClickUntil = Date.now() + 160;
    } else {
      panelLeft = dragStartLeft;
      panelTop = dragStartTop;
      suppressClickUntil = 0;
    }

    dragPointerId = null;
    dragCaptureEl = null;
    isDragArmed = false;
    isDragging = false;
    dragMoved = false;
  }

  function shouldCancelControlClick(event: Event) {
    event.stopPropagation();

    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      return true;
    }

    return false;
  }

  function handleEdgeClose(event: Event) {
    if (shouldCancelControlClick(event)) return;
    void closePlayer();
  }

  function handleWidgetKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      void closePlayer();
    }
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
    if (isPlaying) return '正在播放';
    if (currentTime > 0) return '停在这里';
    return '点一下继续';
  }

  function getPlaybackNote() {
    if (loadState === 'loading') return '歌单正在整理，等一下就能听。';
    if (loadState === 'error') return errorMessage || '播放器刚刚绊了一下。';
    if (loadState === 'empty') return '先上传几首歌，这里就会热闹起来。';
    if (playlist.length > 1) return `后面还有 ${Math.max(playlist.length - 1, 0)} 首，想换就直接点歌单。`;
    return '这一首已经准备好了，慢慢听。';
  }
</script>

<svelte:window
  on:pointermove={handleGlobalPointerMove}
  on:pointerup={finishDragging}
  on:pointercancel={finishDragging}
  on:keydown={handleWidgetKeydown}
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
  class:dragging={isDragging}
  data-anchor-x={panelAnchorX}
  data-anchor-y={panelAnchorY}
  style={getPanelInlineStyle(panelLeft, panelTop, isOpen, isListOpen, panelAnchorX, panelAnchorY)}
>
  <div class="mp-shell {isOpen ? 'open' : 'closed'}">
    {#if isOpen}
      <button class="mp-edge mp-edge-top" type="button" aria-label="关闭播放器" on:click={handleEdgeClose}></button>
      <button class="mp-edge mp-edge-right" type="button" aria-label="关闭播放器" on:click={handleEdgeClose}></button>
      <button class="mp-edge mp-edge-bottom" type="button" aria-label="关闭播放器" on:click={handleEdgeClose}></button>
      <button class="mp-edge mp-edge-left" type="button" aria-label="关闭播放器" on:click={handleEdgeClose}></button>

      <div class="mp-card">
        <div class="mp-topbar">
          <div class="mp-grip">
            <button
              id="mp-drag-handle"
              type="button"
              aria-label="拖动播放器"
              on:pointerdown={handleDragPointerDown}
<<<<<<< HEAD
=======
              on:mousedown={handleDragMouseDown}
>>>>>>> origin/main
              on:click={handleDragHandleClick}
            ></button>
            <span></span>
            <span></span>
            <span></span>
            <small>拖动</small>
          </div>

          <button type="button" class="mp-mini-btn" aria-label="收起播放器" on:click={handleEdgeClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 14.25L12 9.25L17 14.25"></path>
              <path d="M7 18.25L12 13.25L17 18.25" opacity="0.7"></path>
            </svg>
          </button>
        </div>

        <button
          type="button"
          class="mp-hero"
          aria-label="拖动播放器"
          on:pointerdown={handleDragPointerDown}
        >
          <div class="mp-cover-card">
            {#if currentTrack.cover}
              <img src={currentTrack.cover} alt={currentTrack.name} class="mp-cover-image" />
            {:else}
              <div class:is-playing={isPlaying} class="mp-fallback-cover" style={currentTrackCoverStyle} aria-hidden="true">
                <svg class="mp-cover-art" viewBox="0 0 100 100" fill="none">
                  <circle class="mp-cover-orb mp-cover-orb-a" cx="78" cy="24" r="15"></circle>
                  <circle class="mp-cover-orb mp-cover-orb-b" cx="24" cy="78" r="19"></circle>
                  <circle class="mp-cover-disc" cx="50" cy="52" r="26"></circle>
                  <circle class="mp-cover-disc-ring" cx="50" cy="52" r="14"></circle>
                  <circle class="mp-cover-disc-core" cx="50" cy="52" r="5"></circle>
                  <path class="mp-cover-wave" d="M18 56C28 43 37 40 46 46.5C55 53 63.5 54 82 39"></path>
                  <path class="mp-cover-wave ghost" d="M22 70C33 62 40 60.5 48 65C56 69.5 65 69.5 78 60"></path>
                  <path class="mp-cover-needle" d="M70 22L58 45"></path>
                  <circle class="mp-cover-needle-dot" cx="57" cy="46" r="3.5"></circle>
                </svg>
                <span class="mp-cover-mark">{currentTrackMonogram}</span>
              </div>
            {/if}
          </div>

          <div class="mp-hero-copy">
            <p class="mp-kicker">{getPlaybackEyebrow()}</p>
            <h3 id="mp-name" class="mp-title">{currentTrack.name}</h3>
            <p class="mp-artist">{currentTrack.artist}</p>
            <p class="mp-note">{getPlaybackNote()}</p>
            <div class="mp-meta">
              <span>{playlist.length ? `第 ${currentIndex + 1} 首` : '还没开始'}</span>
              <span>{playlist.length ? `共 ${playlist.length} 首` : '没有歌单'}</span>
            </div>
          </div>
        </button>

        <div class="mp-progress-card">
          <div class="mp-progress-track">
            <div class="mp-progress-fill" style={`width: ${progress}%`}></div>
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

        <div class="mp-actions">
          <div class="mp-transport">
            <button type="button" class="mp-icon-btn" aria-label="上一首" on:click={playPrevious}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M7.25 6.75V17.25"></path>
                <path d="M16.5 7.5L9.75 12L16.5 16.5V7.5Z"></path>
              </svg>
            </button>

            <button type="button" class="mp-icon-btn mp-play-btn" aria-label={isPlaying ? '暂停播放' : '开始播放'} on:click={togglePlay}>
              {#if isPlaying}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M9.25 7V17"></path>
                  <path d="M14.75 7V17"></path>
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M9 7.2V16.8C9 17.57 9.83 18.05 10.5 17.67L17.9 13.47C18.57 13.09 18.57 12.11 17.9 11.73L10.5 7.53C9.83 7.15 9 7.63 9 8.4V7.2Z"></path>
                </svg>
              {/if}
            </button>

            <button type="button" class="mp-icon-btn" aria-label="下一首" on:click={playNext}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16.75 6.75V17.25"></path>
                <path d="M7.5 7.5L14.25 12L7.5 16.5V7.5Z"></path>
              </svg>
            </button>
          </div>

          <button id="mpb-list" type="button" class="mp-icon-btn mp-list-btn {isListOpen ? 'is-open' : ''}" aria-label={isListOpen ? '收起歌单' : '打开歌单'} on:click={toggleList}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 7H18"></path>
              <path d="M9 12H18"></path>
              <path d="M9 17H18"></path>
              <path d="M5.75 7H6.25"></path>
              <path d="M5.75 12H6.25"></path>
              <path d="M5.75 17H6.25"></path>
            </svg>
          </button>
        </div>

        {#if errorMessage}
          <p class="mp-status mp-error">{errorMessage}</p>
        {:else if loadState === 'loading'}
          <p class="mp-status">正在整理歌单…</p>
        {:else if loadState === 'empty'}
          <p class="mp-status">还没有可播放的歌。</p>
        {/if}

        <div id="mp-list-area" class="mp-list-panel {isListOpen ? 'open show' : ''}">
          <div class="mp-search-wrap">
            <input
              id="mp-search"
              bind:value={search}
              type="text"
              placeholder="搜歌名或歌手"
              class="w-full rounded-xl bg-white/15 border border-white/30 px-4 py-2 text-sm font-medium text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 outline-none transition-colors focus:border-[var(--color-primary,#fac7b7)]"
              style="background-color: rgba(255, 255, 255, 0.18);"
              on:click|stopPropagation
              on:keydown|stopPropagation
            />
          </div>

          <div id="mp-list" class="mp-list-scroll">
            {#if filteredTracks.length > 0}
              {#each filteredTracks as track}
                <button
                  type="button"
                  class="mp-track-row mp-li {playlist.findIndex((item) => item === track) === currentIndex ? 'is-active' : ''}"
                  on:click={(event) => handleTrackSelect(playlist.findIndex((item) => item === track), event)}
                >
                  <div class="mp-track-copy">
                    <strong>{track.name}</strong>
                    <span>{track.artist}</span>
                  </div>
                  <small>{playlist.findIndex((item) => item === track) === currentIndex ? (isPlaying ? '正在听' : '已选中') : '播放'}</small>
                </button>
              {/each}
            {:else}
              <div class="mp-empty-search mp-empty">这次没搜到，换个词试试</div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <button
        type="button"
        class="mp-bubble"
        aria-label="打开播放器"
        on:click={togglePlayerFromBubble}
      >
        <span id="mp-name" class="mp-visually-hidden">{currentTrack.name}</span>
        <div class="mp-bubble-ring"></div>
        {#if currentTrack.cover}
          <img src={currentTrack.cover} alt={currentTrack.name} class="mp-cover-image" />
        {:else}
          <div class:is-playing={isPlaying} class="mp-fallback-cover" style={currentTrackCoverStyle} aria-hidden="true">
            <svg class="mp-cover-art" viewBox="0 0 100 100" fill="none">
              <circle class="mp-cover-orb mp-cover-orb-a" cx="78" cy="24" r="15"></circle>
              <circle class="mp-cover-orb mp-cover-orb-b" cx="24" cy="78" r="19"></circle>
              <circle class="mp-cover-disc" cx="50" cy="52" r="26"></circle>
              <circle class="mp-cover-disc-ring" cx="50" cy="52" r="14"></circle>
              <circle class="mp-cover-disc-core" cx="50" cy="52" r="5"></circle>
              <path class="mp-cover-wave" d="M18 56C28 43 37 40 46 46.5C55 53 63.5 54 82 39"></path>
              <path class="mp-cover-wave ghost" d="M22 70C33 62 40 60.5 48 65C56 69.5 65 69.5 78 60"></path>
              <path class="mp-cover-needle" d="M70 22L58 45"></path>
              <circle class="mp-cover-needle-dot" cx="57" cy="46" r="3.5"></circle>
            </svg>
            <span class="mp-cover-mark">{currentTrackMonogram}</span>
          </div>
        {/if}
        <div class="mp-bubble-glow {isPlaying ? 'is-playing' : ''}"></div>
      </button>
    {/if}
  </div>
</div>

<style>
  #mp {
    position: fixed;
    z-index: 10050;
    transition: filter 0.22s ease;
  }

  #mp.dragging {
    transition: none;
    filter: drop-shadow(0 16px 36px rgba(var(--shadow-rgb), 0.18));
  }

  .mp-shell {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: var(--color-text);
    background:
      linear-gradient(160deg, rgba(var(--color-bg-rgb), 0.9), rgba(var(--color-bg-rgb), 0.94)),
      rgba(var(--color-bg-rgb), 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(18px);
    box-shadow:
      0 18px 34px rgba(var(--shadow-rgb), 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transform-origin: var(--mp-origin-x) var(--mp-origin-y);
    transition:
      border-radius 0.32s cubic-bezier(0.22, 1, 0.36, 1),
      background 0.32s ease,
      box-shadow 0.32s ease,
      padding 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .mp-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 38%);
    pointer-events: none;
    opacity: 0.95;
  }

  .mp-shell.closed {
    border-radius: 999px;
    padding: 0;
  }

  .mp-shell.open {
    border-radius: 32px;
    padding: 0.56rem;
  }

  .mp-bubble {
    position: relative;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: inherit;
    overflow: hidden;
    cursor: pointer;
    background: transparent;
    padding: 0;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-tap-highlight-color: transparent;
  }

  .mp-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
<<<<<<< HEAD
=======
  }

  .mp-bubble:active {
    cursor: grabbing;
>>>>>>> origin/main
  }

  .mp-bubble-ring {
    position: absolute;
    inset: 0.2rem;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.16);
    z-index: 1;
    pointer-events: none;
  }

  .mp-bubble-glow {
    position: absolute;
    inset: auto 18% 8% 18%;
    height: 0.35rem;
    border-radius: 999px;
    background: rgba(var(--glow-primary-rgb), 0.22);
    filter: blur(10px);
    opacity: 0.7;
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  .mp-bubble-glow.is-playing {
    opacity: 1;
    transform: scaleX(1.08);
  }

  .mp-cover-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .mp-card {
    position: relative;
    z-index: 1;
    display: flex;
    height: 100%;
    flex-direction: column;
    gap: 0.72rem;
    border-radius: 26px;
    padding: 0.82rem;
    overflow: hidden;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.12), transparent 38%),
      linear-gradient(145deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03)),
      rgba(var(--color-bg-rgb), 0.84);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 12px 22px rgba(var(--shadow-rgb), 0.08);
  }

  .mp-edge {
    position: absolute;
    z-index: 2;
    border: none;
    background: transparent;
    padding: 0;
    opacity: 0;
  }

  .mp-edge-top,
  .mp-edge-bottom {
    left: 0.7rem;
    right: 0.7rem;
    height: 0.58rem;
  }

  .mp-edge-top {
    top: 0;
  }

  .mp-edge-bottom {
    bottom: 0;
  }

  .mp-edge-left,
  .mp-edge-right {
    top: 0.7rem;
    bottom: 0.7rem;
    width: 0.58rem;
  }

  .mp-edge-left {
    left: 0;
  }

  .mp-edge-right {
    right: 0;
  }

  .mp-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .mp-grip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
    padding: 0 0.84rem;
    height: 2rem;
  }

  #mp-drag-handle {
    position: absolute;
    inset: 0;
    z-index: 10;
    cursor: grab;
    border: none;
    background: transparent;
    padding: 0;
  }

  #mp-drag-handle:active {
    cursor: grabbing;
  }

  .mp-grip span {
    width: 0.34rem;
    height: 0.12rem;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.84;
  }

  .mp-grip small {
    margin-left: 0.46rem;
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .mp-mini-btn,
  .mp-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.18), transparent 70%),
      rgba(255, 255, 255, 0.045);
    color: rgba(248, 243, 231, 0.92);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 10px 22px rgba(var(--shadow-rgb), 0.08);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }

  .mp-mini-btn:hover,
  .mp-icon-btn:hover {
    transform: translateY(-1px) scale(1.03);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
  }

  .mp-mini-btn:active,
  .mp-icon-btn:active {
    transform: scale(0.96);
  }

  .mp-mini-btn {
    width: 2rem;
    height: 2rem;
    border-radius: 18px;
  }

  .mp-mini-btn svg,
  .mp-icon-btn svg {
    width: 1rem;
    height: 1rem;
    display: block;
  }

  .mp-hero {
    appearance: none;
    border: none;
    width: 100%;
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 0.78rem;
    padding: 0.82rem;
    border-radius: 24px;
    text-align: left;
    color: inherit;
    background:
      radial-gradient(circle at top right, rgba(255, 255, 255, 0.18), transparent 44%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.04));
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-drag: none;
  }

  .mp-hero:active {
    cursor: grabbing;
  }

  .mp-cover-card {
    position: relative;
    width: 5rem;
    height: 5rem;
    overflow: hidden;
    border-radius: 22px;
    box-shadow: 0 16px 28px rgba(var(--shadow-rgb), 0.16);
  }

  .mp-fallback-cover {
    --mp-cover-start: #7c3aed;
    --mp-cover-end: #2563eb;
    --mp-cover-accent: rgba(255, 255, 255, 0.84);
    --mp-cover-glow: rgba(255, 255, 255, 0.36);
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    align-items: flex-end;
    justify-content: flex-start;
    overflow: hidden;
    border-radius: inherit;
    padding: 0.45rem;
    background:
      radial-gradient(circle at 18% 18%, var(--mp-cover-glow), transparent 36%),
      radial-gradient(circle at 82% 26%, rgba(255, 255, 255, 0.14), transparent 24%),
      linear-gradient(145deg, var(--mp-cover-start), var(--mp-cover-end));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      inset 0 -16px 24px rgba(14, 18, 32, 0.2);
  }

  .mp-fallback-cover::after {
    content: '';
    position: absolute;
    inset: 10%;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.12);
    opacity: 0.8;
    pointer-events: none;
  }

  .mp-cover-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .mp-cover-orb {
    fill: rgba(255, 255, 255, 0.14);
  }

  .mp-cover-disc {
    fill: rgba(8, 12, 24, 0.18);
    stroke: rgba(255, 255, 255, 0.26);
    stroke-width: 1.6;
    transform-box: fill-box;
    transform-origin: center;
  }

  .mp-cover-disc-ring {
    stroke: rgba(255, 255, 255, 0.48);
    stroke-width: 1.8;
    transform-box: fill-box;
    transform-origin: center;
  }

  .mp-cover-disc-core {
    fill: rgba(255, 255, 255, 0.9);
  }

  .mp-cover-wave {
    stroke: rgba(255, 255, 255, 0.72);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mp-cover-wave.ghost {
    stroke-width: 3.5;
    opacity: 0.34;
  }

  .mp-cover-needle {
    stroke: rgba(255, 255, 255, 0.62);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .mp-cover-needle-dot {
    fill: var(--mp-cover-accent);
  }

  .mp-cover-mark {
    position: relative;
    z-index: 1;
    font-size: 0.9rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.94);
    text-shadow: 0 6px 14px rgba(0, 0, 0, 0.18);
  }

  .mp-fallback-cover.is-playing .mp-cover-disc,
  .mp-fallback-cover.is-playing .mp-cover-disc-ring {
    transform: scale(1.02);
  }

  .mp-hero-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .mp-kicker {
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.62;
  }

  .mp-title {
    margin-top: 0.28rem;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.12;
    letter-spacing: -0.03em;
  }

  .mp-artist {
    margin-top: 0.22rem;
    font-size: 0.74rem;
    font-weight: 800;
    opacity: 0.72;
  }

  .mp-note {
    margin-top: 0.34rem;
    font-size: 0.72rem;
    line-height: 1.45;
    opacity: 0.66;
  }

  .mp-meta {
    margin-top: 0.52rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .mp-meta span {
    padding: 0.34rem 0.56rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background: rgba(255, 255, 255, 0.05);
    font-size: 0.58rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    opacity: 0.72;
  }

  .mp-progress-card {
    position: relative;
    padding: 0.8rem 0.82rem 0.72rem;
    border-radius: 22px;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.1);
    background: rgba(255, 255, 255, 0.04);
  }

  .mp-progress-track {
    height: 0.46rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .mp-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--color-primary) 0% 50%, rgba(255, 255, 255, 0.92) 50% 100%);
    transition: width 0.12s linear;
  }

  .mp-progress-input {
    position: absolute;
    inset: 0.48rem 0.82rem auto 0.82rem;
    width: calc(100% - 1.64rem);
    height: 1rem;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .mp-progress-input:focus {
    outline: none;
  }

  .mp-progress-input::-webkit-slider-runnable-track {
    height: 0.46rem;
    background: transparent;
  }

  .mp-progress-input::-moz-range-track {
    height: 0.46rem;
    border: none;
    background: transparent;
  }

  .mp-progress-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 1rem;
    height: 1rem;
    margin-top: -0.28rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.8) 42%, rgba(var(--glow-primary-rgb), 0.98) 100%);
    box-shadow:
      0 0 0 0.22rem rgba(var(--glow-primary-rgb), 0.14),
      0 10px 18px rgba(var(--shadow-rgb), 0.18);
  }

  .mp-progress-input::-moz-range-thumb {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.8) 42%, rgba(var(--glow-primary-rgb), 0.98) 100%);
    box-shadow:
      0 0 0 0.22rem rgba(var(--glow-primary-rgb), 0.14),
      0 10px 18px rgba(var(--shadow-rgb), 0.18);
  }

  .mp-time-row {
    margin-top: 0.42rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    opacity: 0.66;
  }

  .mp-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.7rem;
  }

  .mp-transport {
    display: inline-flex;
    align-items: center;
    gap: 0.48rem;
  }

  .mp-icon-btn {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 999px;
  }

  .mp-play-btn {
    width: 2.95rem;
    height: 2.95rem;
    background:
      radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.34), transparent 34%),
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.9) 0% 50%, var(--color-primary) 50% 100%);
    color: var(--color-button-text);
    border-color: transparent;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      0 16px 28px rgba(var(--shadow-rgb), 0.18);
  }

  .mp-play-btn svg {
    width: 1.12rem;
    height: 1.12rem;
  }

  .mp-list-btn {
    justify-self: end;
    border-radius: 18px;
  }

  .mp-list-btn.is-open {
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.2), transparent 72%),
      rgba(255, 255, 255, 0.08);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
  }

  .mp-status {
    margin-top: -0.1rem;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.45;
    opacity: 0.7;
  }

  .mp-error {
    color: #fca5a5;
    opacity: 1;
  }

  .mp-list-panel {
    display: flex;
    min-height: 0;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 0.58rem;
    max-height: 0;
    margin-top: 0;
    padding: 0;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
    transform: translate3d(0, 6px, 0);
    transition:
      max-height 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.2s ease,
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      margin-top 0.2s ease,
      padding 0.2s ease;
  }

  .mp-list-panel.open {
    flex: 1 1 auto;
    max-height: 100%;
    min-height: 0;
    margin-top: 0.08rem;
    padding: 0.58rem;
    opacity: 1;
    overflow-y: auto;
    overflow-x: hidden;
    pointer-events: auto;
    transform: translate3d(0, 0, 0);
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
  }

  .mp-search-wrap {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.44rem 0.72rem;
  }

  .mp-search-wrap input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .mp-search-wrap input::placeholder {
    color: var(--color-text-soft);
  }

  .mp-list-scroll {
    min-height: 0;
    flex: 0 0 auto;
    overflow: visible;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-right: 0.08rem;
  }

  .mp-track-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.72rem;
    padding: 0.82rem 0.88rem;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    text-align: left;
    transition:
      transform 0.16s ease,
      border-color 0.16s ease,
      background 0.16s ease;
  }

  .mp-track-row:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--glow-primary-rgb), 0.16);
  }

  .mp-track-row.is-active {
    border-color: rgba(var(--glow-primary-rgb), 0.28);
    background: rgba(255, 255, 255, 0.07);
  }

  .mp-track-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .mp-track-copy strong {
    font-size: 0.8rem;
    font-weight: 900;
    line-height: 1.14;
  }

  .mp-track-copy span {
    margin-top: 0.18rem;
    font-size: 0.68rem;
    font-weight: 700;
    opacity: 0.68;
  }

  .mp-track-row small,
  .mp-empty-search {
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    opacity: 0.62;
  }

  .mp-empty-search {
    padding: 0.9rem 0.4rem 0.4rem;
  }

  @media (max-width: 640px) {
    .mp-shell.open {
      padding: 0.48rem;
      border-radius: 28px;
    }

    .mp-card {
      border-radius: 22px;
      padding: 0.72rem;
      gap: 0.62rem;
    }

    .mp-hero {
      grid-template-columns: 4.5rem minmax(0, 1fr);
      padding: 0.72rem;
      border-radius: 20px;
    }

    .mp-cover-card {
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 18px;
    }

    .mp-note {
      font-size: 0.68rem;
    }

    .mp-grip {
      height: 1.86rem;
      padding: 0 0.74rem;
    }
  }
</style>
