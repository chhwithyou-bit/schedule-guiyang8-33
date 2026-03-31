import { writable } from 'svelte/store';

export type CommunityConsoleTab = 'account' | 'chats' | 'groups' | 'drive' | 'notifications';

type CommunityConsoleState = {
  tab: CommunityConsoleTab;
  conversationId: string;
};

const initialState: CommunityConsoleState = {
  tab: 'account',
  conversationId: ''
};

export const communityConsoleState = writable<CommunityConsoleState>(initialState);

export function setCommunityConsoleState(next: Partial<CommunityConsoleState>) {
  communityConsoleState.update((state) => ({ ...state, ...next }));
}

export function resetCommunityConsoleState() {
  communityConsoleState.set(initialState);
}
