import { writable } from 'svelte/store';

export const currentView = writable<string>('schedule');
export const themeInitialized = writable<boolean>(false);

// Schedule Data Stores
export const schedule = writable<any[]>([]);
export const eveningSelfStudy = writable<Record<string, any>>({});
export const sanjiTests = writable<Record<string, any>>({});
export const syncStatus = writable<string>('Initializing...');

// User Auth Store
export const user = writable<any>(null);
export const isAuthenticated = writable<boolean>(false);
