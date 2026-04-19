const { test, expect } = require('@playwright/test');

function buildDiscoveryState() {
  return {
    directUser: {
      id: 'user-alice',
      username: 'Alice',
      signature: '夜间联调搭子',
      avatar_url: '',
      role: 'user',
      xp: 220,
      level: 3
    },
    group: {
      id: 'group-night-sprint',
      title: 'Night Sprint',
      description: '深夜修交互和动画的协作群',
      member_count: 6,
      joined: false
    },
    nodes: [
      {
        id: 'node-1',
        name: 'Tokyo Relay',
        raw: 'ss://ZXhhbXBsZQ==',
        protocol: 'ss',
        source_label: '常用订阅'
      }
    ],
    sources: [
      {
        id: 'source-1',
        label: '常用订阅',
        source_type: 'subscription',
        enabled: true,
        node_count: 1,
        updated_at: '2026-03-28T10:30:00.000Z'
      }
    ],
    conversations: [
      {
        id: 'group-general',
        kind: 'group',
        title: 'General Lounge',
        description: '默认测试群组',
        member_count: 4,
        avatar_url: '',
        unread_count: 1,
        last_message: '欢迎进入联调环境',
        last_sender_name: 'System',
        last_message_at: '2026-03-28T10:30:00.000Z',
        updated_at: '2026-03-28T10:30:00.000Z'
      }
    ],
    messages: {
      'group-general': [
        {
          id: 'msg-g-1',
          sender_id: 'system',
          sender: { username: 'System' },
          content: '欢迎进入联调环境',
          created_at: '2026-03-28T10:30:00.000Z'
        }
      ]
    }
  };
}

function installApiMocks(page, state) {
  const getUnreadTotal = () => state.conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);

  return page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/chats' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        conversations: state.conversations,
        unread_total: getUnreadTotal()
      });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'GET') {
      const conversationId = url.searchParams.get('conversation_id') || '';
      return fulfill({ ok: true, messages: state.messages[conversationId] || [] });
    }

    if (pathname === '/api/community/discovery' && req.method() === 'GET') {
      const users = [state.directUser].filter((user) => {
        if (!query) return true;
        return [user.username, user.signature].some((value) => String(value || '').toLowerCase().includes(query));
      });
      const groups = [state.group].filter((group) => {
        if (!query) return true;
        return [group.title, group.description].some((value) => String(value || '').toLowerCase().includes(query));
      });
      return fulfill({ ok: true, users, groups });
    }

    if (pathname === '/api/nodes' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        nodes: state.nodes,
        sources: state.sources,
        subscription_url: '/api/nodes/subscription?pwd=playwright-session',
        raw: state.nodes.map((item) => item.raw).join('\n'),
        clients: {
          shadowrocket: 'shadowrocket://add/sub://example',
          clash: '/api/nodes/subscription?pwd=playwright-session'
        }
      });
    }

    if (pathname === '/api/community/drive/info') {
      return fulfill({
        ok: true,
        stats: {
          quota_bytes: 1024 * 1024 * 1024,
          used_bytes: 128 * 1024 * 1024
        }
      });
    }

    if (pathname === '/api/community/drive/list') {
      return fulfill({ ok: true, files: [] });
    }

    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });

    return fulfill({
      ok: true,
      users: [],
      groups: [],
      posts: [],
      messages: [],
      conversations: [],
      unread_total: 0
    });
  });
}

async function bootApp(page) {
  await page.goto('/community');
  try {
    const btn = page.locator('button[data-theme-id="theme-default"]');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await page.waitForSelector('#liquidBar');
}

test.beforeEach(async ({ page }) => {
  const state = buildDiscoveryState();
  await page.addInitScript((user) => {
    localStorage.setItem('commUser', JSON.stringify(user));
  }, {
    id: 'debug-user',
    username: 'debugger',
    passHash: 'playwright-session',
    role: 'owner',
    xp: 999
  });
  await installApiMocks(page, state);
});

test('liquid bar expands and switches routes from the top-left dock', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  const panel = page.locator('#liquidBar .liquid-panel');
  const liquidBar = page.locator('#liquidBar');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');

  await liquidBar.getByRole('link', { name: /课表/ }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: '课程安排' })).toBeVisible();

  await trigger.click();
  await expect(panel).toBeVisible();
  await liquidBar.getByRole('link', { name: /节点/ }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/nodes$/);
  await expect(page.getByRole('heading', { name: '节点' })).toBeVisible();
});

test('liquid bar keeps real route actions reachable', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  const liquidBar = page.locator('#liquidBar');
  await trigger.click();
  await liquidBar.locator('.liquid-compose-btn').click();
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.getByRole('heading', { name: '社区', exact: true })).toBeVisible();

  await page.locator('#liquidBar .liquid-trigger').click();
  await liquidBar.getByRole('link', { name: /进入聊天/ }).click();
  await expect(page).toHaveURL(/\/console\/chats(\?conversation=.*)?$/);
  await expect(page.getByRole('heading', { name: '私聊与会话' })).toBeVisible();

  await page.locator('#liquidBar .liquid-trigger').click();
  await liquidBar.getByRole('link', { name: /查看群组/ }).click();
  await expect(page).toHaveURL(/\/console\/groups$/);
  await expect(page.getByRole('heading', { name: '群组与发现' })).toBeVisible();
});

test('liquid bar closes with escape and returns focus to trigger', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  await trigger.focus();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  const panel = page.locator('#liquidBar .liquid-panel');
  await expect(panel).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test.describe('mobile liquid bar', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true
  });

  test('touching the dock opens the panel and still allows route switching', async ({ page }) => {
    await bootApp(page);

    const trigger = page.locator('#liquidBar .liquid-trigger');
    const panel = page.locator('#liquidBar .liquid-panel');
    const liquidBar = page.locator('#liquidBar');
    await trigger.tap();
    await expect(panel).toBeVisible();

    await liquidBar.getByRole('link', { name: /课表/ }).tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(page.getByRole('heading', { name: '课程安排' })).toBeVisible();
  });
});
