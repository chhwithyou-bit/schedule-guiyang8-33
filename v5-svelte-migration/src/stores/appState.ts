import { writable } from 'svelte/store';

export const currentView = writable('schedule');
export const themeInitialized = writable(false);

// Schedule Data Stores
export const schedule = writable([]);
export const eveningSelfStudy = writable({});
export const sanjiTests = writable({});
export const syncStatus = writable('Initializing...');

// User Auth Store
export const user = writable(null);
export const isAuthenticated = writable(false);
