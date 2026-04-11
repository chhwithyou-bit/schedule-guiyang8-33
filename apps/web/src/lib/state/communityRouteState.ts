export type CommunityEntityRef = {
  id: string;
  kind: 'post' | 'profile';
};

export function postHref(id: string) {
  return `/community/posts/${encodeURIComponent(id)}`;
}

export function profileHref(id: string) {
  return `/community/profiles/${encodeURIComponent(id)}`;
}
