import { get } from 'svelte/store';
import { user, type CommunityUser } from '../stores/appState';

export type CommunitySession = CommunityUser & {
  username: string;
  authToken: string;
};

function isSessionLike(value: unknown): value is CommunitySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as CommunitySession;
  return Boolean(String(session.username || '').trim() && String(session.authToken || '').trim());
}

export function readStoredCommunitySession(): CommunitySession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem('commUser');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSessionLike(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getCommunitySession(): CommunitySession | null {
  const activeUser = get(user);
  if (isSessionLike(activeUser)) return activeUser;
  return readStoredCommunitySession();
}

export function getCommunityAuthHeaders(headers: HeadersInit = {}): Headers {
  const resolvedHeaders = new Headers(headers);
  const session = getCommunitySession();

  if (session?.authToken) {
    resolvedHeaders.set('Authorization', buildCommunityAuthHeader(session.authToken));
  }

  return resolvedHeaders;
}

export function buildCommunityAuthHeader(authToken: string) {
  return `Bearer ${authToken}`;
}

export function communityFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: getCommunityAuthHeaders(init.headers)
  });
}

export function persistCommunitySession(nextUser: unknown) {
  if (typeof window === 'undefined') return;
  if (isSessionLike(nextUser)) {
    localStorage.setItem('commUser', JSON.stringify(nextUser));
  } else {
    localStorage.removeItem('commUser');
  }
}
