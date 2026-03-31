<script lang="ts">
  import { onMount } from 'svelte';

  type Track = {
    name: string;
    artist: string;
    url: string;
    cover?: string | null;
  };

  const FALLBACK_TRACK: Track = {
    name: 'Loading playlist...',
    artist: 'Music Hub',
    url: '',
    cover: null
  };

  let audioEl: HTMLAudioElement;
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

  $: filteredTracks = playlist.filter((track) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [track.name, track.artist].some((value) => String(value || '').toLowerCase().includes(needle));
  });

  $: currentTrack = playlist[currentIndex] || getFallbackTrack();

  $: if (audioEl && currentTrack.url && currentTrack.url !== lastBoundUrl) {
    bindTrackToAudio(currentTrack.url);
  }

  onMount(() => {
    void loadPlaylist();

    return () => {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      }
    };
  });

  function getFallbackTrack(): Track {
    if (loadState === 'error') {
      return { name: 'Music unavailable', artist: 'Check your playlist source', url: '', cover: null };
    }
    if (loadState === 'empty') {
      return { name: 'No tracks found', artist: 'Upload audio to R2 or playlist.json', url: '', cover: null };
    }
    return FALLBACK_TRACK;
  }

  function normalizeTrack(track: any, index: number): Track | null {
    if (!track || typeof track !== 'object') return null;
    const url = String(track.url || '').trim();
    if (!url) return null;

    return {
      name: String(track.name || '').trim() || `Track ${index + 1}`,
      artist: String(track.artist || '').trim() || 'Unknown Artist',
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
      errorMessage = 'Playlist failed to load.';
      resetAudioElement();
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

  function togglePlayer() {
    isOpen = !isOpen;
    if (!isOpen) {
      isListOpen = false;
      search = '';
    }
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
      errorMessage = 'Playback blocked or track unavailable.';
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

  function toggleList(event: Event) {
    event.stopPropagation();
    if (!isOpen) isOpen = true;
    isListOpen = !isListOpen;
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
    errorMessage = 'Track source is unreachable.';
  }

  function formatTime(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0:00';
    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
</script>

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
  id="mp"
  class:open={isOpen}
  class="fixed left-6 z-[10050] overflow-hidden border shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.2,1.14,0.24,1)]"
  style="bottom: max(24px, calc(env(safe-area-inset-bottom) + 16px)); width: {isOpen ? 'min(22rem, calc(100vw - 2rem))' : '3.5rem'}; height: {isOpen ? 'auto' : '3.5rem'};"
  on:click={togglePlayer}
  on:keydown={(event) => event.key === 'Enter' && togglePlayer()}
  role="button"
  tabindex="0"
>
  <div class="mp-shell {isOpen ? 'open' : 'closed'}">
    <div class="mp-main">
      <p id="mp-name" class="mp-sr-only">{currentTrack.name}</p>
      <div class="mp-badge">
        {#if currentTrack.cover}
          <img src={currentTrack.cover} alt={currentTrack.name} class="h-full w-full object-cover" />
        {:else if !isOpen}
          <svg class="h-6 w-6 {isPlaying ? 'animate-pulse' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        {:else}
          <span>8C</span>
        {/if}
      </div>

      {#if isOpen}
        <div class="mp-content">
          <div class="mp-topline">
            <div class="min-w-0">
              <p class="truncate text-sm font-black">{currentTrack.name}</p>
              <p class="truncate text-[11px] font-bold uppercase tracking-[0.22em] opacity-50">{currentTrack.artist}</p>
            </div>

            <div class="mp-actions">
              <button class="mp-icon-btn" on:click={playPrevious} aria-label="Previous track">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM18.5 6.2v11.6c0 .8-.9 1.3-1.6.8L9 12.8c-.6-.4-.6-1.3 0-1.7l7.9-5.7c.7-.5 1.6 0 1.6.8z"></path></svg>
              </button>

              <button class="mp-icon-btn mp-play-btn" on:click={togglePlay} aria-label={isPlaying ? 'Pause music' : 'Play music'}>
                {#if isPlaying}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                {:else}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                {/if}
              </button>

              <button class="mp-icon-btn" on:click={playNext} aria-label="Next track">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5.5 6.2v11.6c0 .8.9 1.3 1.6.8l7.9-5.8c.6-.4.6-1.3 0-1.7L7.1 5.4c-.7-.5-1.6 0-1.6.8z"></path></svg>
              </button>

              <button id="mpb-list" class="mp-icon-btn" on:click={toggleList} aria-label="Toggle playlist">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h12"></path><path d="M8 12h12"></path><path d="M8 18h12"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>
              </button>
            </div>
          </div>

          <div class="mp-progress-wrap">
            <div class="mp-progress-bar">
              <div class="mp-progress-fill" style="width: {progress}%"></div>
            </div>
            <div class="mp-time-row">
              <span>{formatTime(currentTime)}</span>
              <span>{duration ? formatTime(duration) : '--:--'}</span>
            </div>
          </div>

          {#if errorMessage}
            <p class="mp-status mp-error">{errorMessage}</p>
          {:else if loadState === 'loading'}
            <p class="mp-status">Loading playlist...</p>
          {:else if loadState === 'empty'}
            <p class="mp-status">Music library is empty.</p>
          {/if}

          <div id="mp-list-area" class:show={isListOpen}>
            <div class="mp-search-wrap">
              <input
                id="mp-search"
                bind:value={search}
                type="text"
                placeholder="Search track or artist"
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
                      <span class="mp-li-state">{isPlaying ? 'Playing' : 'Ready'}</span>
                    {:else}
                      <span class="mp-li-index">{String(filteredIndex + 1).padStart(2, '0')}</span>
                    {/if}
                  </button>
                {/each}
              {:else}
                <div class="mp-empty">没有匹配的歌曲</div>
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
    border-color: rgba(245, 239, 224, 0.12);
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

  .mp-shell {
    background: rgba(var(--color-bg-rgb), 0.96);
    color: var(--color-text);
  }

  .mp-shell.closed {
    border-radius: 999px;
  }

  .mp-shell.open {
    border-radius: 28px;
  }

  .mp-main {
    position: relative;
    min-height: 3.5rem;
    padding: 0.35rem;
  }

  .mp-badge {
    position: absolute;
    left: 0.35rem;
    top: 0.35rem;
    display: flex;
    height: 2.8rem;
    width: 2.8rem;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-bg);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  .mp-content {
    padding: 0.15rem 0.5rem 0.5rem 3.35rem;
  }

  .mp-topline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .mp-actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .mp-icon-btn {
    display: inline-flex;
    height: 2rem;
    width: 2rem;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgba(245, 239, 224, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .mp-icon-btn:hover {
    transform: scale(1.06);
    border-color: rgba(245, 239, 224, 0.2);
  }

  .mp-play-btn {
    background: var(--color-primary);
    color: var(--color-bg);
    border-color: transparent;
  }

  .mp-progress-wrap {
    margin-top: 0.55rem;
  }

  .mp-progress-bar {
    height: 0.35rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .mp-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--color-primary);
    transition: width 0.15s linear;
  }

  .mp-time-row {
    margin-top: 0.35rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0.55;
  }

  .mp-status {
    margin-top: 0.5rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0.6;
  }

  .mp-error {
    color: #fca5a5;
    opacity: 1;
  }

  #mp-list-area {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.28s ease, opacity 0.22s ease, margin-top 0.22s ease;
  }

  #mp-list-area.show {
    max-height: 16rem;
    opacity: 1;
    margin-top: 0.7rem;
  }

  .mp-search-wrap {
    border: 1px solid rgba(245, 239, 224, 0.12);
    border-radius: 18px;
    background: rgba(var(--color-bg-rgb), 0.98);
    padding: 0.25rem 0.65rem;
  }

  .mp-search-wrap input {
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;
    outline: none;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .mp-search-wrap input::placeholder {
    color: rgba(245, 239, 224, 0.38);
  }

  .mp-list {
    margin-top: 0.55rem;
    max-height: 11.5rem;
    overflow: auto;
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
    padding: 0.7rem 0.8rem;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .mp-li:hover {
    transform: translateY(-1px);
    border-color: rgba(245, 239, 224, 0.16);
  }

  .mp-li.active {
    border-color: rgba(245, 239, 224, 0.28);
    background: rgba(255, 255, 255, 0.06);
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
    letter-spacing: 0.14em;
    text-transform: uppercase;
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
    #mp {
      left: 1rem;
    }
  }
</style>
