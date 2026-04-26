import { writable } from 'svelte/store';

export type CommunitySection = 'feed' | 'discovery' | 'notifications';

export type CommunityViewState = {
  section: CommunitySection;
};

const initialState: CommunityViewState = {
  section: 'feed'
};

export const communityViewState = writable<CommunityViewState>(initialState);

export function setCommunityViewState(next: Partial<CommunityViewState>) {
  communityViewState.update((state) => ({
    ...state,
    ...next
  }));
}

export function resetCommunityViewState() {
  communityViewState.set(initialState);
}
