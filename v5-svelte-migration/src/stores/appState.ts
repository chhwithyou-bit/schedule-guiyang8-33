import { writable } from 'svelte/store';

export const currentView = writable('schedule'); // default view
export const themeInitialized = writable(false);
