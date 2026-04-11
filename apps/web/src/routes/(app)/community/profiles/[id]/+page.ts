import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const profileId = params.id;

  const [profileResponse, postsResponse] = await Promise.all([
    fetch(`/api/community/profile?id=${encodeURIComponent(profileId)}`),
    fetch(`/api/community/posts?userId=${encodeURIComponent(profileId)}`)
  ]);

  const profileData = await profileResponse.json().catch(() => ({ ok: false }));
  const postsData = await postsResponse.json().catch(() => ({ ok: false }));

  return {
    id: profileId,
    user: profileData?.ok ? profileData.user || null : null,
    posts: postsData?.ok && Array.isArray(postsData.posts) ? postsData.posts : []
  };
};
