export function listCommunityComments(postId: string) {
  return {
    ok: true,
    postId,
    items: [],
    source: 'migration-scaffold'
  };
}
