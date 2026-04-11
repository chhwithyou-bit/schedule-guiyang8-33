export type AdminAction =
  | 'delete_item'
  | 'resolve_report'
  | 'ban_user'
  | 'unban_user'
  | 'grant_admin'
  | 'revoke_admin'
  | 'reset_password'
  | 'set_drive_quota'
  | 'set_announcement'
  | 'set_nodes_password'
  | 'create_node_source'
  | 'delete_node_source';

export type AdminDashboardPayload = {
  ok: boolean;
  reports: unknown[];
  users: unknown[];
  announcement: { content: string; updatedAt?: string | null };
  node_sources?: unknown[];
  proxy_nodes?: unknown[];
  nodes_password_configured?: boolean;
};

export function normalizeAdminDashboardPayload(payload: Partial<AdminDashboardPayload>): AdminDashboardPayload {
  return {
    ok: true,
    reports: Array.isArray(payload.reports) ? payload.reports : [],
    users: Array.isArray(payload.users) ? payload.users : [],
    announcement: {
      content: String(payload.announcement?.content || ''),
      updatedAt: payload.announcement?.updatedAt || null
    },
    node_sources: Array.isArray(payload.node_sources) ? payload.node_sources : [],
    proxy_nodes: Array.isArray(payload.proxy_nodes) ? payload.proxy_nodes : [],
    nodes_password_configured: Boolean(payload.nodes_password_configured)
  };
}

export function createAdminActionBody(action: AdminAction, target_type: string, target_id: string, extra: Record<string, unknown> = {}) {
  return {
    action,
    target_type,
    target_id,
    ...extra
  };
}
