<script lang="ts">
  import { onMount } from 'svelte';

  type Track = {
    name: string;
    artist: string;
    url: string;
    cover?: string | null;
  };

  const PANEL_MARGIN = 12;

  let audioEl: HTMLAudioElement;
  let widgetEl: HTMLDivElement;
  let isOpen = false;
  let isListOpen = false;
  let isPlaying = false;
  let isDragging = false;
  let dragMoved = false;
  let search = '';
  let playlist: Track[] = [];
  let currentIndex = 0;
  let panelLeft = 0;
  let panelTop = 0;
  let dragPointerId: number | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let suppressClickUntil = 0;
  let lastBoundUrl = '';

  const fallbackTrack: Track = {
    name: '正在找歌',
    artist: '稍等一下，马上就好',
    url: ''
  };

  $: currentTrack = playlist[currentIndex] || fallbackTrack;
  $: filteredTracks = playlist.filter((track) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [track.name, track.artist].some((value) => String(value || '').toLowerCase().includes(needle));
  });

  $: if (audioEl && currentTrack.url && currentTrack.url !== lastBoundUrl) {
    audioEl.src = currentTrack.url;
    lastBoundUrl = currentTrack.url;
    if (isPlaying) void audioEl.play().catch(() => (isPlaying = false));
  }

  onMount(() => {
    const size = getPanelSize(false, false);
    panelLeft = Math.max(PANEL_MARGIN, window.innerWidth - size.width - PANEL_MARGIN);
    panelTop = Math.max(PANEL_MARGIN, window.innerHeight - size.height - PANEL_MARGIN);
    syncPanelToViewport();
    void loadPlaylist();

    const handleResize = () => syncPanelToViewport();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

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

  async function loadPlaylist() {
    try {
      const response = await fetch('/api/music');
      const data = await response.json();
      const list = Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : [];
      playlist = list.map(normalizeTrack).filter(Boolean) as Track[];
      currentIndex = playlist.length > 0 ? 0 : -1;
    } catch (error) {
      console.error('Failed to load music playlist', error);
      playlist = [];
      currentIndex = -1;
    }
  }

  function getPanelSize(open = isOpen, listOpen = isListOpen) {
    if (!open) return { width: 64, height: 64 };
    const width = Math.min(340, window.innerWidth - PANEL_MARGIN * 2);
    const height = Math.min(listOpen ? 584 : 392, window.innerHeight - PANEL_MARGIN * 2);
    return { width, height };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function syncPanelToViewport(open = isOpen, listOpen = isListOpen) {
    if (typeof window === 'undefined') return;
    const { width, height } = getPanelSize(open, listOpen);
    panelLeft = clamp(panelLeft, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN));
    panelTop = clamp(panelTop, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN));
  }

  function toggleOpen(event?: MouseEvent) {
    const target = event?.target as Element | null;
    if (target?.closest('button, input, .panel-body, .drag-handle')) return;
    if (Date.now() < suppressClickUntil || dragMoved) return;
    isOpen = !isOpen;
    if (!isOpen) isListOpen = false;
    syncPanelToViewport(isOpen, isListOpen);
  }

  function handleWidgetKeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleOpen();
  }

  function toggleList(event: MouseEvent) {
    event.stopPropagation();
    isOpen = true;
    isListOpen = !isListOpen;
    syncPanelToViewport(isOpen, isListOpen);
  }

  async function togglePlay(event: MouseEvent) {
    event.stopPropagation();
    if (!audioEl || !currentTrack.url) return;
    if (isPlaying) {
      audioEl.pause();
      isPlaying = false;
      return;
    }
    try {
      await audioEl.play();
      isPlaying = true;
    } catch {
      isPlaying = false;
    }
  }

  function selectTrack(index: number) {
    const track = filteredTracks[index];
    if (!track) return;
    const nextIndex = playlist.findIndex((item) => item.url === track.url && item.name === track.name);
    if (nextIndex >= 0) currentIndex = nextIndex;
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;
    dragPointerId = event.pointerId;
    isDragging = true;
    dragMoved = false;
    suppressClickUntil = 0;
    dragOffsetX = event.clientX - panelLeft;
    dragOffsetY = event.clientY - panelTop;
    target.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging || dragPointerId !== event.pointerId) return;
    const { width, height } = getPanelSize(isOpen, isListOpen);
    const nextLeft = event.clientX - dragOffsetX;
    const nextTop = event.clientY - dragOffsetY;
    if (Math.abs(nextLeft - panelLeft) > 2 || Math.abs(nextTop - panelTop) > 2) dragMoved = true;
    panelLeft = clamp(nextLeft, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN));
    panelTop = clamp(nextTop, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN));
  }

  function onPointerUp(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    isDragging = false;
    dragPointerId = null;
    if (dragMoved) suppressClickUntil = Date.now() + 280;
  }

  function handleAudioEnded() {
    if (playlist.length === 0) {
      isPlaying = false;
      return;
    }
    currentIndex = (currentIndex + 1) % playlist.length;
  }
</script>

<div
  id="mp"
  bind:this={widgetEl}
  class="music-widget {isOpen ? 'open' : ''} {isListOpen ? 'list-open' : ''} {isDragging ? 'is-dragging' : ''}"
  data-origin-x={panelLeft + getPanelSize().width / 2 > (typeof window !== 'undefined' ? window.innerWidth / 2 : 0) ? 'right' : 'left'}
  data-origin-y={panelTop + getPanelSize().height / 2 > (typeof window !== 'undefined' ? window.innerHeight / 2 : 0) ? 'bottom' : 'top'}
  style={`left: ${panelLeft}px; top: ${panelTop}px;`}
  role="button"
  tabindex="0"
  on:click={toggleOpen}
  on:keydown={handleWidgetKeydown}
>
  <audio bind:this={audioEl} on:ended={handleAudioEnded}></audio>

  <button
    type="button"
    id="mp-drag-handle"
    class="drag-handle"
    aria-label="拖动播放器"
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
  >
    <span></span><span></span><span></span>
  </button>

  <div class="compact-cover" aria-hidden="true">{isPlaying ? 'Ⅱ' : '♪'}</div>

  <div class="panel-body">
    <div class="track-head">
      <div class="cover" aria-hidden="true">{currentTrack.name.slice(0, 1) || '/'}</div>
      <div class="track-copy">
        <p id="mp-name">{currentTrack.name}</p>
        <span>{currentTrack.artist}</span>
      </div>
    </div>

    <div class="controls">
      <button type="button" on:click={togglePlay}>{isPlaying ? '暂停' : '播放'}</button>
      <button type="button" id="mpb-list" on:click={toggleList}>{isListOpen ? '收起列表' : '列表'}</button>
    </div>

    <div id="mp-list-area" class="list-area {isListOpen ? 'show' : ''}">
      <label class="mp-search-wrap">
        <span>Search</span>
        <input id="mp-search" bind:value={search} placeholder="歌曲或歌手" />
      </label>

      <div id="mp-list" class="mp-list">
        {#if filteredTracks.length > 0}
          {#each filteredTracks as track, index}
            <button type="button" class="mp-li" class:is-current={track.url === currentTrack.url} on:click={() => selectTrack(index)}>
              <span>{track.name}</span>
              <small>{track.artist}</small>
            </button>
          {/each}
        {:else}
          <p class="mp-empty">这次没搜到，换个词试试。</p>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .music-widget {
    position: fixed;
    z-index: 5200;
    width: 64px;
    height: 64px;
    overflow: hidden;
    border: 1px solid var(--hairline-strong);
    border-radius: 12px;
    background: rgba(250, 249, 245, 0.94);
    box-shadow: 0 18px 44px rgba(var(--shadow-rgb), 0.1);
    color: var(--ink);
    font-family: var(--sans);
    cursor: pointer;
    transition: width 220ms var(--motion-ease-apple), height 220ms var(--motion-ease-apple), border-color 180ms ease, box-shadow 180ms ease;
  }

  .music-widget.open {
    width: min(340px, calc(100vw - 24px));
    height: min(392px, calc(100svh - 24px));
  }

  .music-widget.open.list-open {
    height: min(584px, calc(100svh - 24px));
  }

  .music-widget:hover {
    border-color: var(--ink);
  }

  .drag-handle {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
    display: inline-flex;
    gap: 3px;
    border: 0;
    background: transparent;
    padding: 8px;
    cursor: grab;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-handle span {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: var(--ink-soft);
  }

  .compact-cover {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: var(--clay);
    font-size: 22px;
    transition: opacity 160ms ease;
  }

  .music-widget.open .compact-cover {
    opacity: 0;
    pointer-events: none;
  }

  .panel-body {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s3);
    opacity: 0;
    padding: 48px var(--s3) var(--s3);
    pointer-events: none;
    transition: opacity 180ms ease;
  }

  .music-widget.open .panel-body {
    opacity: 1;
    pointer-events: auto;
  }

  .track-head {
    display: flex;
    gap: var(--s2);
    align-items: center;
  }

  .cover {
    display: grid;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 999px;
    background: var(--clay);
    color: var(--paper);
    font-size: 22px;
    font-weight: 600;
  }

  .track-copy {
    min-width: 0;
  }

  #mp-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 18px;
    font-weight: 600;
  }

  .track-copy span {
    display: block;
    margin-top: 2px;
    overflow: hidden;
    color: var(--ink-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2);
  }

  .controls button {
    min-height: 42px;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-btn);
    background: var(--surface);
    font-size: 14px;
    transition: transform 180ms ease, border-color 180ms ease;
  }

  .controls button:hover {
    transform: translateY(-1px);
    border-color: var(--ink);
  }

  .list-area {
    min-height: 0;
    flex: 1;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease;
  }

  .list-area.show {
    opacity: 1;
    pointer-events: auto;
  }

  .mp-search-wrap {
    display: grid;
    gap: 6px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-btn);
    background: var(--paper);
    padding: 10px 12px;
  }

  .mp-search-wrap span {
    color: var(--clay);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  #mp-search {
    border: none;
    background: transparent;
    padding: 0;
    font-family: var(--sans);
    font-size: 14px;
  }

  #mp-search:focus {
    outline: none;
  }

  .mp-list {
    display: grid;
    gap: 1px;
    max-height: 330px;
    margin-top: var(--s2);
    overflow-y: auto;
    border-top: 1px solid var(--hairline);
  }

  .mp-li {
    display: grid;
    gap: 2px;
    padding: 12px 0;
    text-align: left;
    border-bottom: 1px solid var(--hairline);
  }

  .mp-li span {
    font-size: 14px;
    font-weight: 600;
  }

  .mp-li small {
    color: var(--ink-soft);
    font-size: 12px;
  }

  .mp-li.is-current span {
    color: var(--clay);
  }

  .mp-empty {
    padding: var(--s4) 0;
    color: var(--ink-soft);
    text-align: center;
    font-size: 14px;
  }

  @media (max-width: 640px) {
    .music-widget.open {
      width: min(340px, calc(100vw - 24px));
    }
  }
</style>
