<script lang="ts">
  export let routeKey = '';
  export let prefersReducedMotion = false;
</script>

<div class:reduced={prefersReducedMotion} data-route-key={routeKey} class="page-transition-wrapper page-transition-shell">
  <slot />
</div>

<style>
  .page-transition-shell {
    animation: wash-in 320ms ease-out;
    overflow: visible;
  }

  .page-transition-shell.reduced {
    animation: none;
  }

  @keyframes wash-in {
    from {
      opacity: 0;
      transform: translateY(10px);
      filter: blur(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }
</style>
