import { writable } from 'svelte/store';

export type CommunityConsoleTab = 'account' | 'drive' | 'notifications';

export type CommunityConsoleState = {
  tab: CommunityConsoleTab;
  returnFocusSelector: string;
};

const STORAGE_KEY = 'communityConsoleState';

const initialState: CommunityConsoleState = {
  tab: 'account',
  returnFocusSelector: ''
};

function isCommunityConsoleTab(value: unknown): value is CommunityConsoleTab {
  return ['account', 'drive', 'notifications'].includes(String(value || ''));
}

function normalizeCommunityConsoleState(value: unknown): CommunityConsoleState {
  if (!value || typeof value !== 'object') {
    return initialState;
  }

  const candidate = value as Partial<CommunityConsoleState>;
  return {
    tab: isCommunityConsoleTab(candidate.tab) ? candidate.tab : initialState.tab,
    returnFocusSelector: typeof candidate.returnFocusSelector === 'string' ? candidate.returnFocusSelector : initialState.returnFocusSelector
  };
}

function readStoredCommunityConsoleState(): CommunityConsoleState {
  if (typeof window === 'undefined') {
    return initialState;
  }

  try {
    return normalizeCommunityConsoleState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return initialState;
  }
}

function persistCommunityConsoleState(state: CommunityConsoleState) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const communityConsoleState = writable<CommunityConsoleState>(readStoredCommunityConsoleState());

communityConsoleState.subscribe((state) => {
  persistCommunityConsoleState(state);
});

export function setCommunityConsoleState(next: Partial<CommunityConsoleState>) {
  communityConsoleState.update((state) => normalizeCommunityConsoleState({ ...state, ...next }));
}

export function resetCommunityConsoleState() {
  communityConsoleState.set(initialState);
}
