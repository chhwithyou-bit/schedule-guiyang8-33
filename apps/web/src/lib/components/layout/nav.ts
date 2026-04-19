export type NavItem = {
  href: string;
  label: string;
  eyebrow: string;
  detail: string;
  short: string;
  capsule: string;
  shortLabel?: string;
  requiresAdmin?: boolean;
};

export const topLevelNavItems: NavItem[] = [
  {
    href: '/community',
    label: '社区',
    eyebrow: '8community',
    detail: '用真实 URL 承接原来的社区主入口，不改帖子和个人详情的细节路径。',
    short: '看近况',
    capsule: '社交流动'
  },
  {
    href: '/console',
    label: '消息台',
    shortLabel: '消息',
    eyebrow: 'main console',
    detail: '个人、消息和账户入口都改成真实页面路由，不再依赖 currentView 切换。',
    short: '开消息台',
    capsule: '消息中枢'
  },
  {
    href: '/schedule',
    label: '课表',
    eyebrow: 'today flow',
    detail: '课表页仍保持原有信息密度，只把切换动作迁移到标准 URL。',
    short: '看安排',
    capsule: '今日节奏'
  },
  {
    href: '/xiangqi',
    label: '象棋',
    eyebrow: 'slow game',
    detail: '象棋入口改为独立页面地址，回退和深链行为更稳定。',
    short: '开一局',
    capsule: '慢一点'
  },
  {
    href: '/nodes',
    label: '节点',
    eyebrow: 'proxy hub',
    detail: '节点与订阅入口改成真实路由，方便回归和部署核对。',
    short: '开节点',
    capsule: '通道切换'
  },
  {
    href: '/admin',
    label: '管理',
    eyebrow: 'control room',
    detail: '后台入口改为标准路由，仅在管理员可见时展示。',
    short: '巡一下',
    capsule: '管理视角',
    requiresAdmin: true
  }
];

export function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getVisibleNavItems(isAdmin: boolean) {
  return topLevelNavItems.filter((item) => !item.requiresAdmin || isAdmin);
}
