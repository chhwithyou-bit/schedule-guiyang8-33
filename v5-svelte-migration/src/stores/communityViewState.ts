import { writable } from 'svelte/store';

export type CommunitySection = 'feed' | 'discovery' | 'messages' | 'notifications';
export type CommunityMessageTab = 'chats' | 'groups';

export type CommunityViewState = {
  section: CommunitySection;
  messageTab: CommunityMessageTab;
};

const initialState: CommunityViewState = {
  section: 'feed',
  messageTab: 'chats'
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
