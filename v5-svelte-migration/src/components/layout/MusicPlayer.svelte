<script lang="ts">
  import { fade, fly } from 'svelte/transition';
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
  const OPEN_PANEL_BASE_HEIGHT_REM = 18.25;
  const OPEN_PANEL_LIST_HEIGHT_REM = 15.5;
  const PANEL_TRANSITION_MS = 520;
  const PANEL_CONTENT_TRANSITION_MS = 420;
  const AUTOPLAY_UNLOCK_EVENTS = ['pointerdown', 'keydown'] as const;
  const INITIAL_PANEL_LEFT = typeof window === 'undefined' ? 24 : getDefaultPanelLeft();
  const INITIAL_PANEL_TOP = typeof window === 'undefined' ? 24 : getDefaultPanelTop();

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
  let currentTrackMonogram = '♪';
  let currentTrackCoverPalette: CoverPalette = getTrackCoverPalette(FALLBACK_TRACK);
  let currentTrackCoverStyle = buildTrackCoverStyle(currentTrackCoverPalette);

  let panelLeft = INITIAL_PANEL_LEFT;
  let panelTop = INITIAL_PANEL_TOP;
  let restPanelLeft = INITIAL_PANEL_LEFT;
  let restPanelTop = INITIAL_PANEL_TOP;
  let lastOpenPanelLeft = INITIAL_PANEL_LEFT;
  let lastOpenPanelTop = INITIAL_PANEL_TOP;
  let hasStoredOpenPanel = false;
  let userHasDraggedOpenPanel = false;
  let panelOriginX: PanelEdge = 'right';
  let panelOriginY: PanelVerticalEdge = 'bottom';
  let panelReady = false;
  let openBaseHeight = 0;
  let isDraggingWidget = false;
  let dragPointerId: number | null = null;
  let dragCaptureEl: HTMLElement | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanelLeft = 0;
  let dragStartPanelTop = 0;
  let dragStartRestPanelLeft = 0;
  let dragStartRestPanelTop = 0;
  let dragMoved = false;
  let openTransitionEndsAt = 0;
  let openMotionX = 28;
  let openMotionY = 18;
  let panelOriginXPercent = '100%';
  let panelOriginYPercent = '100%';
  let pendingAutoplayUnlock = false;

  $: isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

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
    const sourceParts = [track?.name, track?.artist]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .flatMap((value) => value.split(/[\s\-_/]+/).filter(Boolean));

    if (sourceParts.length >= 2) {
      const first = Array.from(sourceParts[0])[0] || '';
      const second = Array.from(sourceParts[1])[0] || '';
      return `${first}${second}`.toUpperCase();
    }

    const fallbackChars = Array.from(sourceParts[0] || String(track?.name || '').trim());
    if (fallbackChars.length >= 2) {
      return `${fallbackChars[0]}${fallbackChars[1]}`.toUpperCase();
    }

    if (fallbackChars.length === 1) {
      return fallbackChars[0].toUpperCase();
    }

    return '♪';
  }

  function getTrackCoverPalette(track: Track): CoverPalette {
    const seed = hashString(`${track?.name || ''}::${track?.artist || ''}`);
    const hue = seed % 360;

    return {
      start: toHsl((hue + 14) % 360, 74, 58),
      end: toHsl((hue + 92) % 360, 76, 48),
      accent: toHsl((hue + 164) % 360, 94, 80),
      glow: toHsl((hue + 224) % 360, 82, 72)
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
      await attemptAutoplayForCurrentTrack();
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

  function waitForNextFrame() {
    return new Promise<void>((resolve) => {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }

      window.requestAnimationFrame(() => resolve());
    });
  }

  function markOpenTransitionWindow() {
    if (typeof window === 'undefined') return;
    openTransitionEndsAt = window.performance.now() + PANEL_TRANSITION_MS;
  }

  function isOpenTransitionActive() {
    return typeof window !== 'undefined' && window.performance.now() < openTransitionEndsAt;
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

  async function togglePlayer() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    if (!isOpen) {
      await openPlayerFromClosedAnchor(false);
      return;
    }

    isOpen = false;
    isListOpen = false;
    search = '';
    await syncPanelPosition({ preserveOrigin: true });
  }

  async function collapsePlayer(event: Event) {
    if (shouldCancelControlClick(event)) return;
    event.stopPropagation();

    isOpen = false;
    isListOpen = false;
    search = '';
    await syncPanelPosition({ preserveOrigin: true });
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

  function togglePlay(event: Event) {
    if (shouldCancelControlClick(event)) return;
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
    if (event && shouldCancelControlClick(event)) return;
    event?.stopPropagation();
    if (!playlist.length) return;
    const nextIndex = (currentIndex + 1) % playlist.length;
    selectTrack(nextIndex, autoplay);
  }

  function playPrevious(event?: Event, autoplay = true) {
    if (event && shouldCancelControlClick(event)) return;
    event?.stopPropagation();
    if (!playlist.length) return;
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    selectTrack(prevIndex, autoplay);
  }

  async function toggleList(event: Event) {
    if (shouldCancelControlClick(event)) return;
    event.stopPropagation();
    if (!isOpen) {
      await openPlayerFromClosedAnchor(true);
      return;
    }

    const preservedLeft = panelLeft;
    const preservedTop = panelTop;
    isListOpen = !isListOpen;
    await tick();
    await waitForNextFrame();

    const { width, height } = getPanelDimensions();
    panelLeft = preservedLeft;
    panelTop = preservedTop;
    stabilizeOpenPanelAnchor(width, height);
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
    if (isOpenTransitionActive()) {
      return;
    }

    dragPointerId = typeof pointerId === 'number' ? pointerId : null;
    dragCaptureEl = target;
    dragOffsetX = clientX - panelLeft;
    dragOffsetY = clientY - panelTop;
    dragStartX = clientX;
    dragStartY = clientY;
    dragStartPanelLeft = panelLeft;
    dragStartPanelTop = panelTop;
    dragStartRestPanelLeft = restPanelLeft;
    dragStartRestPanelTop = restPanelTop;
    dragMoved = false;
    isDraggingWidget = true;

    if (typeof pointerId === 'number') {
      dragCaptureEl?.setPointerCapture(pointerId);
    }
  }

  function shouldCancelControlClick(event: Event) {
    event.stopPropagation();

    if (!dragMoved) return false;

    dragMoved = false;
    event.preventDefault();
    return true;
  }

  function handleControlPointerDown(event: PointerEvent) {
    if (!widgetEl || !isOpen || event.button !== 0) return;
    event.stopPropagation();
    beginDragging(event.clientX, event.clientY, event.currentTarget as HTMLElement, event.pointerId);
  }

  function handleControlMouseDown(event: MouseEvent) {
    if (!widgetEl || !isOpen || isDraggingWidget || event.button !== 0) return;
    event.stopPropagation();
    beginDragging(event.clientX, event.clientY, event.currentTarget as HTMLElement);
  }

  async function syncPanelPosition(options: { reset?: boolean; preserveOrigin?: boolean } = {}) {
    await tick();
    await waitForNextFrame();
    if (typeof window === 'undefined') return;

    const { reset = false, preserveOrigin = false } = options;
    const { width, height } = getPanelDimensions();

    if (!panelReady || reset) {
      restPanelLeft = getDefaultPanelLeft();
      restPanelTop = getDefaultPanelTop();
      panelReady = true;
    }

    if (!preserveOrigin) {
      if (isOpen) {
        resolvePanelOrigins(panelLeft, panelTop, width, height);
      } else {
        resolvePanelOrigins(restPanelLeft, restPanelTop, getClosedPanelSize(), getClosedPanelHeight());
      }
    }

    if (!isOpen) {
      clampRestPanelToViewport();
      panelLeft = restPanelLeft;
      panelTop = restPanelTop;
      return;
    }

    clampRestPanelToViewport();
    positionPanelFromRest(width, height);
    clampPanelToViewport(width, height);
    lastOpenPanelLeft = panelLeft;
    lastOpenPanelTop = panelTop;
    hasStoredOpenPanel = true;
  }

  async function initializePanelPosition() {
    await tick();
    await syncPanelPosition({ reset: true, preserveOrigin: true });
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
    const rootFontSize = getRootFontSize();
    return (OPEN_PANEL_BASE_HEIGHT_REM + (isListOpen ? OPEN_PANEL_LIST_HEIGHT_REM : 0)) * rootFontSize;
  }

  function getMeasuredOpenPanelHeight() {
    if (!isOpen || !widgetEl) return null;

    const rect = widgetEl.getBoundingClientRect();
    const renderedHeight = Math.max(
      Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 0,
      widgetEl.offsetHeight || 0
    );

    if (!isListOpen) {
      if (renderedHeight > 0) {
        openBaseHeight = renderedHeight;
      }
      return renderedHeight > 0 ? renderedHeight : null;
    }

    const listArea = widgetEl.querySelector<HTMLElement>('#mp-list-area');
    if (!listArea) return openBaseHeight || renderedHeight || null;

    const listStyles = getComputedStyle(listArea);
    const maxHeight = Number.parseFloat(listStyles.maxHeight || '0');
    const marginTop = Number.parseFloat(listStyles.marginTop || '0');
    const visibleListHeight = Math.min(listArea.scrollHeight || 0, maxHeight > 0 ? maxHeight : listArea.scrollHeight || 0);
    const baseHeight = openBaseHeight || renderedHeight;

    return baseHeight > 0 ? baseHeight + marginTop + visibleListHeight : null;
  }

  function getClosedPanelAnchorFromViewport() {
    if (!widgetEl) {
      return {
        left: Number.isFinite(panelLeft) ? panelLeft : getDefaultPanelLeft(),
        top: Number.isFinite(panelTop) ? panelTop : getDefaultPanelTop()
      };
    }

    const rect = widgetEl.getBoundingClientRect();
    const computed = getComputedStyle(widgetEl);
    const nextLeft = Number.isFinite(rect.left)
      ? Math.round(rect.left * 100) / 100
      : Number.parseFloat(computed.left || '');
    const nextTop = Number.isFinite(rect.top)
      ? Math.round(rect.top * 100) / 100
      : Number.parseFloat(computed.top || '');

    return {
      left: Number.isFinite(nextLeft) ? nextLeft : panelLeft,
      top: Number.isFinite(nextTop) ? nextTop : panelTop
    };
  }

  async function openPlayerFromClosedAnchor(showList = false) {
    const closedAnchor = getClosedPanelAnchorFromViewport();
    const closedWidth = getClosedPanelSize();
    const closedHeight = getClosedPanelHeight();

    restPanelLeft = closedAnchor.left;
    restPanelTop = closedAnchor.top;
    panelLeft = closedAnchor.left;
    panelTop = closedAnchor.top;
    panelReady = true;

    resolvePanelOrigins(restPanelLeft, restPanelTop, closedWidth, closedHeight);
    markOpenTransitionWindow();
    isListOpen = showList;
    isOpen = true;

    await tick();
    await waitForNextFrame();

    const { width, height } = getPanelDimensions();

    if (userHasDraggedOpenPanel && !isMobile) {
      panelLeft = lastOpenPanelLeft;
      panelTop = lastOpenPanelTop;
    } else {
      panelLeft = (window.innerWidth - width) / 2;
      panelTop = (window.innerHeight - height) / 2;
      resolvePanelOrigins(panelLeft, panelTop, width, height);
    }
    clampPanelToViewport(width, height);
    lastOpenPanelLeft = panelLeft;
    lastOpenPanelTop = panelTop;
    hasStoredOpenPanel = true;
  }

  function getDefaultPanelLeft() {
    if (typeof window === 'undefined') return PANEL_MARGIN;
    const size = getClosedPanelSize();
    return Math.max(PANEL_MARGIN, window.innerWidth - size - (PANEL_MARGIN * 2));
  }

  function getDefaultPanelTop() {
    if (typeof window === 'undefined') return PANEL_MARGIN;
    const height = getClosedPanelHeight();
    return Math.max(PANEL_MARGIN, window.innerHeight - height - (PANEL_MARGIN * 2));
  }

  function resolvePanelOrigins(
    referenceLeft = panelLeft,
    referenceTop = panelTop,
    referenceWidth = getPanelDimensions().width,
    referenceHeight = getPanelDimensions().height
  ) {
    if (typeof window === 'undefined') return;
    const nextOriginX = referenceLeft + referenceWidth / 2 >= window.innerWidth / 2 ? 'right' : 'left';
    const nextOriginY = referenceTop + referenceHeight / 2 >= window.innerHeight / 2 ? 'bottom' : 'top';
    panelOriginX = nextOriginX;
    panelOriginY = nextOriginY;
  }

  function getPanelDimensions() {
    if (!isOpen) {
      return {
        width: getClosedPanelSize(),
        height: getClosedPanelHeight()
      };
    }

    const measuredHeight = getMeasuredOpenPanelHeight();

    return {
      width: getPreferredPanelWidth(true),
      height: measuredHeight || getEstimatedOpenPanelHeight()
    };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function clampPanelToViewport(width = getPanelDimensions().width, height = getPanelDimensions().height) {
    const nextPosition = clampActualPanelPosition(panelLeft, panelTop, width, height);
    panelLeft = nextPosition.left;
    panelTop = nextPosition.top;
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

  function positionPanelFromRest(width = getPanelDimensions().width, height = getPanelDimensions().height) {
    if (isMobile || !userHasDraggedOpenPanel) {
      panelLeft = (window.innerWidth - width) / 2;
      panelTop = (window.innerHeight - height) / 2;
      resolvePanelOrigins(panelLeft, panelTop, width, height);
      return;
    }

    const closedWidth = getClosedPanelSize();
    const closedHeight = getClosedPanelHeight();
    panelLeft = panelOriginX === 'right' ? restPanelLeft + closedWidth - width : restPanelLeft;
    panelTop = panelOriginY === 'bottom' ? restPanelTop + closedHeight - height : restPanelTop;
  }

  function stabilizeOpenPanelAnchor(width = getPanelDimensions().width, height = getPanelDimensions().height) {
    clampPanelToViewport(width, height);
    syncRestPanelFromPosition(width, height);
    clampRestPanelToViewport();
    positionPanelFromRest(width, height);
    clampPanelToViewport(width, height);
    lastOpenPanelLeft = panelLeft;
    lastOpenPanelTop = panelTop;
    hasStoredOpenPanel = true;
  }

  function syncRestPanelFromPosition(width = getPanelDimensions().width, height = getPanelDimensions().height, left = panelLeft, top = panelTop) {
    const closedWidth = getClosedPanelSize();
    const closedHeight = getClosedPanelHeight();
    restPanelLeft = panelOriginX === 'right' ? left + width - closedWidth : left;
    restPanelTop = panelOriginY === 'bottom' ? top + height - closedHeight : top;
  }

  function clampRestPanelToViewport() {
    const nextPosition = clampActualPanelPosition(restPanelLeft, restPanelTop, getClosedPanelSize(), getClosedPanelHeight());
    restPanelLeft = nextPosition.left;
    restPanelTop = nextPosition.top;
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
  }

  function finishDragging(event?: PointerEvent | MouseEvent) {
    if (!isDraggingWidget) return;
    if (event && 'pointerId' in event && dragPointerId !== null && event.pointerId !== dragPointerId) return;

    if (dragCaptureEl && dragPointerId !== null) {
      try {
        dragCaptureEl.releasePointerCapture(dragPointerId);
      } catch {}
    }

    if (dragMoved) {
      const { width, height } = getPanelDimensions();
      clampPanelToViewport(width, height);
      resolvePanelOrigins(panelLeft, panelTop, width, height);
      stabilizeOpenPanelAnchor(width, height);
      if (isOpen) userHasDraggedOpenPanel = true;
    } else {
      panelLeft = dragStartPanelLeft;
      panelTop = dragStartPanelTop;
      restPanelLeft = dragStartRestPanelLeft;
      restPanelTop = dragStartRestPanelTop;
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
  class="fixed z-[10050] overflow-visible transition-[left,top,width,height,box-shadow,transform] ease-[cubic-bezier(0.22,1,0.36,1)]"
  style="left: {panelLeft}px; top: {panelTop}px; width: {isOpen ? `min(18.75rem, calc(100vw - ${PANEL_MARGIN * 2}px))` : '3.75rem'}; --mp-open-x: {openMotionX}px; --mp-open-y: {openMotionY}px; --mp-origin-x: {panelOriginXPercent}; --mp-origin-y: {panelOriginYPercent}; --mp-panel-duration: {PANEL_TRANSITION_MS}ms;"
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
      on:mousedown={handleDragMouseDown}
      on:pointerdown={handleDragPointerDown}
      on:pointermove={handleDragPointerMove}
      on:pointerup={finishDragging}
      on:pointercancel={finishDragging}
    >
      <span></span>
      <span></span>
      <span></span>
      <small class="mp-drag-label">拖动</small>
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
        </div>
      {:else}
        <div class="mp-content" in:fly|local={{ x: openMotionX, y: openMotionY, duration: PANEL_CONTENT_TRANSITION_MS }}>
          <div class="mp-topline">
            <div>
              <p class="mp-kicker">随手听歌</p>
              <p class="mp-topline-copy">按住上面的横杆，整块都能拖着走。</p>
            </div>

            <button
              class="mp-icon-btn mp-collapse-btn"
              on:click={collapsePlayer}
              on:mousedown={handleControlMouseDown}
              on:pointerdown={handleControlPointerDown}
              aria-label="收起播放器"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M7 14.25L12 9.25L17 14.25"></path>
                <path d="M7 18.25L12 13.25L17 18.25" opacity="0.72"></path>
              </svg>
            </button>
          </div>

          <div
            class="mp-hero"
            on:mousedown={handleControlMouseDown}
            on:pointerdown={handleControlPointerDown}
          >
            <div class="mp-badge large mp-cover-card">
              {#if currentTrack.cover}
                <img src={currentTrack.cover} alt={currentTrack.name} class="h-full w-full object-cover" />
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
              <p class="mp-hero-eyebrow">{getPlaybackEyebrow()}</p>
              <h3 class="mp-track-title">{currentTrack.name}</h3>
              <p class="mp-track-artist">{currentTrack.artist}</p>
              <p class="mp-hero-note">{getPlaybackNote()}</p>
              <div class="mp-meta-row">
                <span>{playlist.length ? `第 ${currentIndex + 1} 首` : '还没开始'}</span>
                <span>{playlist.length ? `共 ${playlist.length} 首` : '没有歌单'}</span>
              </div>
            </div>
          </div>

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
                style="--mp-progress: {progress}%;"
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
              <button
                class="mp-icon-btn"
                on:click={playPrevious}
                on:mousedown={handleControlMouseDown}
                on:pointerdown={handleControlPointerDown}
                aria-label="上一首"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M7.25 6.75V17.25"></path>
                  <path d="M16.5 7.5L9.75 12L16.5 16.5V7.5Z"></path>
                </svg>
              </button>

              <button
                class="mp-icon-btn mp-play-btn"
                on:click={togglePlay}
                on:mousedown={handleControlMouseDown}
                on:pointerdown={handleControlPointerDown}
                aria-label={isPlaying ? '暂停播放' : '开始播放'}
              >
                {#if isPlaying}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9.25 7V17"></path>
                    <path d="M14.75 7V17"></path>
                  </svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M9 7.2V16.8C9 17.57 9.83 18.05 10.5 17.67L17.9 13.47C18.57 13.09 18.57 12.11 17.9 11.73L10.5 7.53C9.83 7.15 9 7.63 9 8.4V7.2Z"></path>
                  </svg>
                {/if}
              </button>

              <button
                class="mp-icon-btn"
                on:click={playNext}
                on:mousedown={handleControlMouseDown}
                on:pointerdown={handleControlPointerDown}
                aria-label="下一首"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M16.75 6.75V17.25"></path>
                  <path d="M7.5 7.5L14.25 12L7.5 16.5V7.5Z"></path>
                </svg>
              </button>
            </div>

            <button
              id="mpb-list"
              class="mp-icon-btn mp-list-btn {isListOpen ? 'is-open' : ''}"
              on:click={toggleList}
              on:mousedown={handleControlMouseDown}
              on:pointerdown={handleControlPointerDown}
              aria-label={isListOpen ? '收起歌单' : '打开歌单'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
    transition-duration: var(--mp-panel-duration, 520ms);
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
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03)),
      rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 8px 18px rgba(var(--shadow-rgb), 0.08);
    color: rgba(245, 239, 224, 0.56);
  }

  .mp-drag-handle.open span {
    opacity: 0.8;
  }

  .mp-drag-label {
    display: block;
    margin-left: 0.42rem;
    font-size: 0.56rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .mp-shell {
    position: relative;
    overflow: hidden;
    background: rgba(var(--color-bg-rgb), 0.985);
    color: var(--color-text);
    backdrop-filter: blur(22px);
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    box-shadow: var(--shadow-xl-token);
    transform-origin: var(--mp-origin-x) var(--mp-origin-y);
    transition: border-radius 0.52s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.52s ease, border-color 0.52s ease, background 0.52s ease;
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
    transition: opacity 0.42s ease, transform 0.52s cubic-bezier(0.22, 1, 0.36, 1);
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
    color: var(--color-button-text);
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
    border-radius: 18px;
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
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    cursor: grab;
    touch-action: none;
  }

  .mp-hero:active {
    cursor: grabbing;
  }

  .mp-cover-card {
    position: relative;
    box-shadow: 0 14px 28px rgba(var(--shadow-rgb), 0.16);
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
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 6px 14px rgba(0, 0, 0, 0.18);
  }

  .mp-cover-card .mp-cover-mark {
    font-size: 0.94rem;
  }

  .mp-fallback-cover.is-playing .mp-cover-disc,
  .mp-fallback-cover.is-playing .mp-cover-disc-ring {
    animation: mp-cover-spin 6s linear infinite;
  }

  @keyframes mp-cover-spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
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
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.32rem 0.55rem;
  }

  .mp-progress-card {
    margin-top: 0.72rem;
    padding: 0.75rem 0.8rem;
    border-radius: 20px;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.1);
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
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .mp-progress-input:focus {
    outline: none;
  }

  .mp-progress-input::-webkit-slider-runnable-track {
    height: 0.45rem;
    border-radius: 999px;
    background: transparent;
  }

  .mp-progress-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 1rem;
    height: 1rem;
    margin-top: -0.275rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.78) 42%, rgba(var(--glow-primary-rgb), 0.98) 100%);
    box-shadow:
      0 0 0 0.22rem rgba(var(--glow-primary-rgb), 0.14),
      0 10px 18px rgba(var(--shadow-rgb), 0.18);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .mp-progress-input::-moz-range-track {
    height: 0.45rem;
    border: none;
    border-radius: 999px;
    background: transparent;
  }

  .mp-progress-input::-moz-range-thumb {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.78) 42%, rgba(var(--glow-primary-rgb), 0.98) 100%);
    box-shadow:
      0 0 0 0.22rem rgba(var(--glow-primary-rgb), 0.14),
      0 10px 18px rgba(var(--shadow-rgb), 0.18);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .mp-progress-input:hover::-webkit-slider-thumb,
  .mp-progress-input:focus-visible::-webkit-slider-thumb,
  .mp-progress-input:hover::-moz-range-thumb,
  .mp-progress-input:focus-visible::-moz-range-thumb {
    transform: scale(1.08);
    box-shadow:
      0 0 0 0.3rem rgba(var(--glow-primary-rgb), 0.18),
      0 12px 22px rgba(var(--shadow-rgb), 0.2);
  }

  .mp-progress-input:active::-webkit-slider-thumb,
  .mp-progress-input:active::-moz-range-thumb {
    transform: scale(0.96);
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
    height: 2.3rem;
    min-width: 2.3rem;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.16), transparent 70%),
      rgba(255, 255, 255, 0.045);
    color: rgba(248, 243, 231, 0.9);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 10px 22px rgba(var(--shadow-rgb), 0.08);
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  }

  .mp-icon-btn svg {
    display: block;
    width: 1rem;
    height: 1rem;
  }

  .mp-icon-btn:hover {
    transform: translateY(-1px) scale(1.03);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.22), transparent 72%),
      rgba(255, 255, 255, 0.07);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 14px 26px rgba(var(--shadow-rgb), 0.12);
  }

  .mp-icon-btn:active {
    transform: scale(0.96);
  }

  .mp-play-btn {
    height: 2.9rem;
    min-width: 2.9rem;
    background:
      radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.32), transparent 34%),
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.9), var(--color-primary));
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
    padding: 0;
    border-radius: 18px;
  }

  .mp-list-btn.is-open {
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.2), transparent 72%),
      rgba(255, 255, 255, 0.08);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
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
    transition: max-height 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.32s ease;
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
    border: 1px solid rgba(var(--glow-primary-rgb), 0.08);
    border-radius: 20px;
  }

  .mp-search-wrap {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.12);
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
    color: var(--color-text-soft);
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
    border: 1px solid rgba(var(--glow-primary-rgb), 0.08);
    background: rgba(255, 255, 255, 0.03);
    padding: 0.8rem 0.85rem;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    color: inherit;
  }

  .mp-li:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--glow-primary-rgb), 0.16);
  }

  .mp-li.active {
    border-color: rgba(var(--glow-primary-rgb), 0.28);
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
