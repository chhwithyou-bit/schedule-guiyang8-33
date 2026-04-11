export function listCommunityChats(userId: string) {
  return {
    ok: true,
    userId,
    conversations: [],
    source: 'migration-scaffold'
  };
}
