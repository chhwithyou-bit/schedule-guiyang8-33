<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';

  export let url: string;

  const MOTION_PROFILE = {
    name: 'expo.out',
    duration: 220
  } as const;

  const transitionParams = {
    y: 8,
    duration: MOTION_PROFILE.duration,
    easing: cubicOut
  };
</script>

<div class="page-transition-wrapper">
  {#key url}
    <div
      class="content-container"
      data-motion-role="page-transition"
      data-view-surface={url}
      in:fly={transitionParams}
      out:fade={{ duration: 120 }}
    >
      <slot />
    </div>
  {/key}
</div>

<style>
  .page-transition-wrapper {
    position: relative;
    width: 100%;
    min-height: 100%;
  }

  .content-container {
    position: relative;
    width: 100%;
  }
</style>
