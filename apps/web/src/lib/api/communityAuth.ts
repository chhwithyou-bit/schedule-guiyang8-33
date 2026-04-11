export type CommunitySession = {
  id?: string;
  username?: string;
  passHash?: string;
  role?: string;
  level?: number;
  xp?: number;
  signature?: string | null;
  avatar_url?: string | null;
  background_url?: string | null;
};

function isSessionLike(value: unknown): value is Required<Pick<CommunitySession, 'username' | 'passHash'>> & CommunitySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as CommunitySession;
  return Boolean(String(session.username || '').trim() && String(session.passHash || '').trim());
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

export function isCommunityAdmin(session: CommunitySession | null | undefined) {
  return session?.role === 'admin' || session?.role === 'owner';
}

export function getCommunityAuthHeaders(headers: HeadersInit = {}): Headers {
  const resolvedHeaders = new Headers(headers);
  const session = readStoredCommunitySession();

  if (session?.username && session?.passHash) {
    resolvedHeaders.set('Authorization', `Bearer ${encodeURIComponent(session.username)}:${session.passHash}`);
  }

  return resolvedHeaders;
}

export function communityFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: getCommunityAuthHeaders(init.headers)
  });
}

export function persistCommunitySession(nextUser: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('commUser', JSON.stringify(nextUser));
}

export function clearCommunitySession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('commUser');
}

export async function submitCommunityAuth(action: 'login' | 'register', username: string, password: string) {
  const response = await fetch('/api/community/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, username, password })
  });

  const data = await response.json();
  if (data?.ok && data.user) {
    persistCommunitySession(data.user);
  }
  return data;
}
