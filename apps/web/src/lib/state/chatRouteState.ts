export type CommunityChatsRouteState = {
  conversationId: string;
};

const STORAGE_KEY = 'communityChatsRouteState';

const initialState: CommunityChatsRouteState = {
  conversationId: ''
};

function normalizeCommunityChatsRouteState(value: unknown): CommunityChatsRouteState {
  if (!value || typeof value !== 'object') {
    return initialState;
  }

  const candidate = value as Partial<CommunityChatsRouteState>;
  return {
    conversationId: typeof candidate.conversationId === 'string' ? candidate.conversationId : initialState.conversationId
  };
}

function readStoredCommunityChatsRouteState(): CommunityChatsRouteState {
  if (typeof window === 'undefined') {
    return initialState;
  }

  try {
    return normalizeCommunityChatsRouteState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return initialState;
  }
}

export function readStoredChatConversationId() {
  return readStoredCommunityChatsRouteState().conversationId;
}

export function persistStoredChatConversationId(conversationId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversationId }));
}

export function clearStoredChatConversationId() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
}

export function chatsHref(conversationId = '') {
  if (!conversationId) {
    return '/console/chats';
  }

  return `/console/chats?conversation=${encodeURIComponent(conversationId)}`;
}
