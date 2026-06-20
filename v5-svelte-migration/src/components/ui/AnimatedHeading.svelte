<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  export let text: string;
  export let tag: 'h1' | 'h2' = 'h1';
  export let className: string = '';
</script>

<svelte:element
  this={tag}
  class={`${className} animated-heading`}
  in:fly={{ y: 8, duration: 220, easing: cubicOut }}
>
  {text}
</svelte:element>

<style>
  .animated-heading {
    font-family: var(--serif);
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }
</style>
