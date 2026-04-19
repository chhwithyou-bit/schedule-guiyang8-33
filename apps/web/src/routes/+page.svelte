<svelte:head>
  <title>Schedule Guiyang</title>
  <meta name="description" content="SvelteKit workspace scaffold for the next Cloudflare deployment path." />
</svelte:head>

<script lang="ts">
  const checkpoints = [
    'SvelteKit 2 + Svelte 5 skeleton',
    'Cloudflare-compatible adapter wiring',
    'Tailwind-ready design system base',
    'Accessibility-first starter shell'
  ];
</script>

<div class="landing-shell">
  <main class="landing-main">
    <header class="landing-header">
      <p class="landing-kicker">Migration workspace</p>
      <h1>Schedule Guiyang is ready for the staged SvelteKit migration.</h1>
      <p>
        This starter keeps the current Worker-based production path intact while providing a stable web app
        foundation for parity work, shared UI extraction, and Cloudflare-native deployments.
      </p>
    </header>

    <section aria-labelledby="migration-checkpoints" class="landing-grid">
      <h2 id="migration-checkpoints" class="sr-only">Migration checkpoints</h2>
      {#each checkpoints as checkpoint}
        <article class="landing-card">
          <p>{checkpoint}</p>
        </article>
      {/each}
    </section>
  </main>
</div>

<style>
  .landing-shell {
    min-height: 100vh;
    background: rgb(var(--color-bg-rgb));
  }

  .landing-main {
    margin: 0 auto;
    max-width: 72rem;
    padding: 4rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .landing-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .landing-kicker {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--color-primary);
  }

  h1 {
    max-width: 48rem;
    margin: 0;
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    line-height: 1.05;
  }

  .landing-header p:last-child {
    max-width: 42rem;
    line-height: 1.7;
    opacity: 0.82;
  }

  .landing-grid {
    display: grid;
    gap: 1rem;
  }

  .landing-card {
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    padding: 1.25rem;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(12px);
  }

  .sr-only {
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

  @media (min-width: 768px) {
    .landing-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
