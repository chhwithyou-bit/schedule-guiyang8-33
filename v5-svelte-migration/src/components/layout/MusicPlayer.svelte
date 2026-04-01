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
  const OPEN_PANEL_BASE_HEIGHT_REM = 18.25;
  const OPEN_PANEL_LIST_HEIGHT_REM = 15.5;
  const PANEL_TRANSITION_MS = 520;
  const PANEL_CONTENT_TRANSITION_MS = 420;

  let audioEl = $state<HTMLAudioElement>();
  let widgetEl = $state<HTMLDivElement>();

  let isOpen = $state(false);
  let isListOpen = $state(false);
  let isPlaying = $state(false);
  let progress = $state(0);
  let duration = $state(0);
  let currentTime = $state(0);
  let search = $state('');
  let errorMessage = $state('');
  let loadState = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
  let playlist = $state<Track[]>([]);
  let currentIndex = $state(0);
  let lastBoundUrl = $state('');
  let panelLeft = $state(24);
  let panelTop = $state(24);
  let dockLeft = $state(24);
  let dockTop = $state(24);
  let restDockLeft = $state(24);
  let restDockTop = $state(24);
  let panelOriginX = $state<PanelEdge>('right');
  let panelOriginY = $state<PanelVerticalEdge>('bottom');
  let panelReady = $state(false);
  let isDraggingWidget = $state(false);
  let dragPointerId = $state<number | null>(null);
  let dragCaptureEl = $state<HTMLElement | null>(null);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanelLeft = 0;
  let dragStartPanelTop = 0;
  let dragStartDockLeft = 0;
  let dragStartDockTop = 0;
  let dragMoved = $state(false);

  const filteredTracks = $derived(
    playlist.filter((track) => {
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return [track.name, track.artist].some((value) => String(value || '').toLowerCase().includes(needle));
    })
  );

  const currentTrack = $derived(playlist[currentIndex] || getFallbackTrack());

  $effect(() => {
    if (audioEl && currentTrack.url && currentTrack.url !== lastBoundUrl) {
      bindTrackToAudio(currentTrack.url);
    }
  });

  const openMotionX = $derived(panelOriginX === 'right' ? 28 : -28);
  const openMotionY = $derived(panelOriginY === 'bottom' ? 18 : -18);
  const panelOriginXPercent = $derived(panelOriginX === 'right' ? '100%' : '0%');
  const panelOriginYPercent = $derived(panelOriginY === 'bottom' ? '100%' : '0%');

  onMount(() => {
    void loadPlaylist();
    void initializePanelPosition();

    const handleResize = () => {
      void syncPanelPosition({ preserveOrigin: true });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);

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

  function syncOpenPanelFromDock(preservedDock = { left: dockLeft, top: dockTop }) {
    dockLeft = preservedDock.left;
    dockTop = preservedDock.top;
    const { width, height } = getPanelDimensions();
    clampDockToViewport(width, height);
  }

  function togglePlayer() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    if (!isOpen) {
      syncClosedStateFromViewport();
      const closedWidth = getClosedPanelSize();
      const closedHeight = getClosedPanelHeight();
      syncDockFromPanel(closedWidth, closedHeight);
      const preservedDock = { left: dockLeft, top: dockTop };
      
      isOpen = true;
      syncOpenPanelFromDock(preservedDock);
      return;
    }

    const { width, height } = getPanelDimensions();
    syncDockFromPanel(width, height);

    isOpen = false;
    isListOpen = false;
    search = '';

    dockLeft = restDockLeft;
    dockTop = restDockTop;
    
    const closedWidth = getClosedPanelSize();
    const closedHeight = getClosedPanelHeight();
    clampDockToViewport(closedWidth, closedHeight);
  }

  function collapsePlayer(event: Event) {
    event.stopPropagation();
    
    const { width, height } = getPanelDimensions();
    syncDockFromPanel(width, height);

    isOpen = false;
    isListOpen = false;
    search = '';
    
    dockLeft = restDockLeft;
    dockTop = restDockTop;
    
    const closedWidth = getClosedPanelSize();
    const closedHeight = getClosedPanelHeight();
    clampDockToViewport(closedWidth, closedHeight);
  }

  function handleHandleClick(event: MouseEvent) {
    event.stopPropagation();

    if (dragMoved) {
      dragMoved = false;
      return;
    }

    if (isOpen) {
      collapsePlayer(event);
      return;
    }

    togglePlayer();
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

  function toggle