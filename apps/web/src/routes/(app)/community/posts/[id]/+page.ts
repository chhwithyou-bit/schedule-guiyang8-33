import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const postId = params.id;

  const [postResponse, commentsResponse] = await Promise.all([
    fetch(`/api/community/posts?id=${encodeURIComponent(postId)}`),
    fetch(`/api/community/comments?postId=${encodeURIComponent(postId)}`)
  ]);

  const postData = await postResponse.json().catch(() => ({ ok: false }));
  const commentsData = await commentsResponse.json().catch(() => ({ ok: false }));

  return {
    id: postId,
    post: postData?.ok && Array.isArray(postData.posts) ? postData.posts[0] || null : null,
    comments: commentsData?.ok && Array.isArray(commentsData.comments) ? commentsData.comments : []
  };
};
