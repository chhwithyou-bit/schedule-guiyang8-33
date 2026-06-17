<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let canComplete = true;
  const dispatch = createEventDispatcher();

  $: if (canComplete) {
    queueMicrotask(() => dispatch('complete'));
  }

  onMount(() => {
    if (canComplete) dispatch('complete');
  });
</script>

<div class="sr-only" aria-live="polite">正在打开 8Community</div>
