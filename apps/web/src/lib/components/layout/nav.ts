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
    eyebrow: 'community',
    detail: '社区首页通过 /community 承接动态、帖子和个人主页等公开内容。',
    short: '看近况',
    capsule: '社区首页'
  },
  {
    href: '/console',
    label: '消息台',
    shortLabel: '消息',
    eyebrow: 'console',
    detail: '消息台首页把聊天、群组和网盘拆成真实子路由，方便直接进入对应页面。',
    short: '看入口',
    capsule: '消息与群组'
  },
  {
    href: '/schedule',
    label: '课表',
    eyebrow: 'schedule',
    detail: '课表页通过 /schedule 提供固定入口，便于回退、深链和回归验证。',
    short: '看安排',
    capsule: '课程安排'
  },
  {
    href: '/xiangqi',
    label: '象棋',
    eyebrow: 'xiangqi',
    detail: '象棋通过独立页面地址进入，方便收藏、返回和继续对局。',
    short: '开一局',
    capsule: '对局入口'
  },
  {
    href: '/nodes',
    label: '节点',
    eyebrow: 'nodes',
    detail: '节点和订阅统一放在 /nodes，部署后可以直接核对入口是否可用。',
    short: '看订阅',
    capsule: '节点订阅'
  },
  {
    href: '/admin',
    label: '管理',
    eyebrow: 'admin',
    detail: '后台入口保持标准路由，仅在管理员身份下显示。',
    short: '去后台',
    capsule: '管理后台',
    requiresAdmin: true
  }
];

export function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getVisibleNavItems(isAdmin: boolean) {
  return topLevelNavItems.filter((item) => !item.requiresAdmin || isAdmin);
}
