<script lang="ts">
	export let initialX = 100;
	export let initialY = 100;

	let x = initialX;
	let y = initialY;
	let isDragging = false;

	let dragStartX = 0;
	let dragStartY = 0;
	let initialMouseX = 0;
	let initialMouseY = 0;

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		isDragging = true;
		dragStartX = x;
		dragStartY = y;
		initialMouseX = event.clientX;
		initialMouseY = event.clientY;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isDragging) return;
		x = dragStartX + (event.clientX - initialMouseX);
		y = dragStartY + (event.clientY - initialMouseY);
	}

	function handlePointerUp(event: PointerEvent) {
		isDragging = false;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch (e) {}
	}
</script>

<div
	class="music-widget"
	class:is-dragging={isDragging}
	style="left: {x}px; top: {y}px;"
	on:pointerdown={handlePointerDown}
	on:pointermove={handlePointerMove}
	on:pointerup={handlePointerUp}
	on:pointercancel={handlePointerUp}
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
		transition: transform 0.2s ease-out, opacity 0.2s ease-out;
		z-index: 1000;
		touch-action: none;
	}

	.music-widget.is-dragging {
		transition: none;
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
