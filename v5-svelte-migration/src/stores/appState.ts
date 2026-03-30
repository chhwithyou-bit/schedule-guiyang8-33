import { writable } from 'svelte/store';

export const currentView = writable<string>('community');
export const themeInitialized = writable<boolean>(false);

// Schedule Data Stores
export const schedule = writable<any[]>([]);
export const eveningSelfStudy = writable<Record<string, any>>({});
export const sanjiTests = writable<Record<string, any>>({});
export const syncStatus = writable<string>('Initializing...');

// User Auth Store
export const user = writable<any>(null);
export const isAuthenticated = writable<boolean>(false);
export const isAdmin = writable<boolean>(false);

// Post Detail Store
export const selectedPost = writable<any>(null);

// Profile Store
export const selectedProfile = writable<any>(null);
