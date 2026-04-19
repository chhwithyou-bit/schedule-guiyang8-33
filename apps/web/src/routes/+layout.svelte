<script lang="ts">
  import '../app.css';
  import ShellChrome from '$lib/ui/ShellChrome.svelte';

  let { children } = $props<{ children?: import('svelte').Snippet }>();
</script>

<ShellChrome>
  {@render children?.()}
</ShellChrome>
