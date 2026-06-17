<script lang="ts">
  import { onMount } from 'svelte';
  import { DEFAULT_THEME_ID, applyTheme } from '../../stores/theme';
  import { themeInitialized } from '../../stores/appState';

  export function handleThemeSwitch(_themeId = DEFAULT_THEME_ID) {
    applyTheme(DEFAULT_THEME_ID);
    themeInitialized.set(true);
    return Promise.resolve();
  }

  onMount(() => {
    applyTheme(DEFAULT_THEME_ID);
    themeInitialized.set(true);

    const handleGlobalRequest = () => {
      void handleThemeSwitch(DEFAULT_THEME_ID);
    };

    window.addEventListener('request-theme-switch', handleGlobalRequest);
    return () => window.removeEventListener('request-theme-switch', handleGlobalRequest);
  });
</script>

<!-- Single-theme project: this component only preserves legacy imports/events. -->
