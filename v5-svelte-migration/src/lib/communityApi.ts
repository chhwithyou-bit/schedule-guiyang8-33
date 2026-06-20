import { get } from 'svelte/store';
import { user, type CommunityUser } from '../stores/appState';

export type CommunitySession = CommunityUser & {
  username: string;
  authToken: string;
};

export const COMMUNITY_MEDIA_UPLOAD_ENDPOINT = '/api/community/media/upload';

export function normalizeCommunityMediaUrl(value: unknown): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('/api/community/media/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('api/community/media/')) return `/${trimmed}`;
  return `/api/community/media/${trimmed}`;
}

function normalizeCommunitySessionMedia(session: CommunitySession): CommunitySession {
  return {
    ...session,
    avatar_url: normalizeCommunityMediaUrl(session.avatar_url),
    background_url: normalizeCommunityMediaUrl(session.background_url)
  };
}

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
    return isSessionLike(parsed) ? normalizeCommunitySessionMedia(parsed) : null;
  } catch {
    return null;
  }
}

export function getCommunitySession(): CommunitySession | null {
  const activeUser = get(user);
  if (isSessionLike(activeUser)) return normalizeCommunitySessionMedia(activeUser);
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

export function isCommunityAdminRole(role: unknown) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return normalizedRole === 'admin' || normalizedRole === 'owner';
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
    localStorage.setItem('commUser', JSON.stringify(normalizeCommunitySessionMedia(nextUser)));
  } else {
    localStorage.removeItem('commUser');
  }
}

export async function refreshStoredCommunitySession(): Promise<CommunitySession | null> {
  const storedSession = readStoredCommunitySession();
  if (!storedSession?.authToken) {
    return storedSession;
  }

  try {
    const res = await fetch('/api/community/me', {
      headers: {
        Authorization: buildCommunityAuthHeader(storedSession.authToken)
      }
    });

    if (res.status === 401 || res.status === 403) {
      persistCommunitySession(null);
      return null;
    }

    const data = await res.json();
    if (!res.ok || !data?.ok || !data.user || typeof data.user !== 'object') {
      return storedSession;
    }

    const nextSession = {
      ...storedSession,
      ...data.user,
      authToken: storedSession.authToken
    };

    if (!isSessionLike(nextSession)) {
      return storedSession;
    }

    persistCommunitySession(nextSession);
    return nextSession;
  } catch {
    return storedSession;
  }
}
