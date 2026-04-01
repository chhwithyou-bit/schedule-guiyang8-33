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
  await page.goto('/');
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

test('liquid bar expands and switches views from the top-left dock', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#liquidBar .liquid-panel')).toBeVisible();

  await page.getByRole('button', { name: /课表/ }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('课程安排')).toBeVisible();

  await trigger.click();
  await page.getByRole('button', { name: /节点/ }).click();
  await expect(page.getByText('推荐用户')).toBeVisible();
});

test('liquid bar keeps community actions reachable', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  await trigger.click();
  await page.locator('#liquidBar .liquid-compose-btn').click();
  await expect(page.getByRole('heading', { name: '发点近况' })).toBeVisible();

  await page.reload();
  await bootApp(page);

  await page.locator('#liquidBar .liquid-trigger').click();
  await page.locator('#liquidBar .liquid-console-btn').click();
  await expect(page.getByRole('heading', { name: '账号 / 聊天 / 网盘' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭' })).toBeVisible();
});

test.describe('mobile liquid bar', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true
  });

  test('touching the dock opens the panel and still allows view switching', async ({ page }) => {
    await bootApp(page);

    const trigger = page.locator('#liquidBar .liquid-trigger');
    const triggerBox = await trigger.boundingBox();
    if (!triggerBox) throw new Error('Missing liquid trigger bounds');

    await page.touchscreen.tap(triggerBox.x + (triggerBox.width / 2), triggerBox.y + (triggerBox.height / 2));
    await expect(page.locator('#liquidBar .liquid-panel')).toBeVisible();

    await page.getByRole('button', { name: /课表/ }).tap();
    await expect(page.getByText('课程安排')).toBeVisible();
  });
});
