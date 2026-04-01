<script lang="ts">
	export let initialX = 100;
	export let initialY = 100;

	let x = initialX;
	let y = initialY;
	let isDragging = false;

	function handleMouseDown() {
		isDragging = true;
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;

		// movementX/Y can jump when the pointer leaves the window; keep this
		// file aligned with the older prototype behavior without using runes.
		x += event.movementX;
		y += event.movementY;
	}

	function handleMouseUp() {
		isDragging = false;
	}
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<div
	class="music-widget"
	style="left: {x}px; top: {y}px;"
	on:mousedown={handleMouseDown}
	role="button"
	tabindex="0"
>
	<div class="header">
		<span>🎵 Music Player</span>
	</div>
	<div class="content">
		<p>Song Title - Artist</p>
		<div class="progress-bar">
			<div class="progress" style="width: 45%;"></div>
		</div>
		<div class="controls">
			<button type="button">⏮</button>
			<button type="button">⏯</button>
			<button type="button">⏭</button>
		</div>
	</div>
</div>

<style>
	.music-widget {
		position: absolute;
		width: 240px;
		background-color: #1e1e1e;
		color: white;
		border-radius: 12px;
		padding: 16px;
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
		cursor: move;
		user-select: none;
		/* Potential cause of jumping: transition on all properties 
		   conflicts with manual position updates in handleMouseMove */
		transition: all 0.2s ease-out;
		z-index: 1000;
	}

	.header {
		font-weight: bold;
		margin-bottom: 12px;
		border-bottom: 1px solid #333;
		padding-bottom: 8px;
		pointer-events: none;
	}

	.content {
		pointer-events: none;
	}

	.controls {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin-top: 12px;
		pointer-events: auto;
	}

	.controls button {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		font-size: 1.2rem;
	}

	.progress-bar {
		width: 100%;
		height: 4px;
		background: #333;
		border-radius: 2px;
		margin-top: 8px;
	}

	.progress {
		height: 100%;
		background: #1db954;
		border-radius: 2px;
	}
</style>
