export function listCommunityNotifications(userId: string) {
  return {
    ok: true,
    userId,
    items: [],
    unread: 0,
    source: 'migration-scaffold'
  };
}
