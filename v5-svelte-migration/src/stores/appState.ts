import { writable } from 'svelte/store';

export type CurrentView = 'community' | 'profile' | 'admin';
export type CommunityRole = 'user' | 'admin' | 'owner' | string;

export type CommunityUser = {
  id: string;
  username: string;
  role?: CommunityRole;
  authToken?: string;
  avatar_url?: string | null;
  signature?: string | null;
  background_url?: string | null;
  xp?: number;
  level?: number;
  is_banned?: number;
  created_at?: string;
  followers_count?: number;
  following_count?: number;
  viewer_is_following?: boolean;
  drive_quota?: number;
  drive_used?: number;
  [key: string]: unknown;
};

export type CommunityPost = {
  id: string;
  user_id?: string;
  username?: string;
  role?: CommunityRole;
  avatar_url?: string | null;
  signature?: string | null;
  background_url?: string | null;
  content?: string | null;
  media_json?: string | null;
  type?: string;
  repost_id?: string | null;
  created_at?: string;
  like_count?: number;
  comment_count?: number;
  favorite_count?: number;
  viewer_liked?: boolean | number;
  viewer_favorited?: boolean | number;
  can_delete?: boolean | number;
  __focusComments?: boolean;
  __openReportComposer?: boolean;
  [key: string]: unknown;
};

export type CommunityProfile = Partial<CommunityUser> & {
  id?: string;
  user_id?: string;
  username?: string;
  __openedAt?: number;
};

export const currentView = writable<CurrentView>('community');
export const themeInitialized = writable<boolean>(false);

export const user = writable<CommunityUser | null>(null);
export const isAuthenticated = writable<boolean>(false);
export const isAdmin = writable<boolean>(false);

export const selectedPost = writable<CommunityPost | null>(null);
export const selectedProfile = writable<CommunityProfile | null>(null);

export function clearSelectedProfile() {
  selectedProfile.set(null);
}
