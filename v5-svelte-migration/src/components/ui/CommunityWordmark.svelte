<script lang="ts">
  let className = '';
  export { className as class };
</script>

<div class={`community-wordmark ${className}`} aria-label="贵阳八中校园墙">
  <span class="mark">贵阳八中</span>
  <span class="slash" aria-hidden="true">/</span>
  <span class="label">校园墙</span>
</div>

<style>
	  .community-wordmark {
	    display: inline-flex;
	    align-items: baseline;
	    gap: 0.45rem;
	    font-family: var(--sans);
	    font-size: clamp(2.6rem, 7vw, 4.6rem);
	    font-weight: 600;
	    letter-spacing: 0;
	    line-height: 0.96;
	    color: var(--ink);
	  }

  .mark {
    white-space: nowrap;
  }

  .slash {
    color: var(--clay);
  }

  .label {
	    font-family: var(--serif);
	    font-size: 0.5em;
	    font-weight: 400;
	    color: var(--ink-soft);
	  }
</style>
