export function listCommunityFollows(userId: string) {
  return {
    ok: true,
    userId,
    followers: [],
    following: [],
    source: 'migration-scaffold'
  };
}
