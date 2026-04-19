const { test, expect } = require('@playwright/test');

function buildChatsState() {
  return {
    conversations: [
      {
        id: 'direct-alice',
        kind: 'direct',
        title: 'Alice',
        description: '夜间联调搭子',
        avatar_url: '',
        unread_count: 2,
        last_message: '今晚继续改 chats 路由吗？',
        last_sender_name: 'Alice',
        last_message_at: '2026-04-11T12:00:00.000Z'
      },
      {
        id: 'group-general',
        kind: 'group',
        title: 'General Lounge',
        description: '默认测试群组',
        avatar_url: '',
        unread_count: 1,
        last_message: '欢迎回来',
        last_sender_name: 'System',
        last_message_at: '2026-04-11T12:05:00.000Z'
      }
    ],
    messages: {
      'direct-alice': [
        {
          id: 'msg-a-1',
          conversation_id: 'direct-alice',
          sender_id: 'user-alice',
          content: '今晚继续改 chats 路由吗？',
          created_at: '2026-04-11T12:00:00.000Z',
          sender: { username: 'Alice' }
        }
      ],
      'group-general': [
        {
          id: 'msg-g-1',
          conversation_id: 'group-general',
          sender_id: 'system',
          content: '欢迎回来',
          created_at: '2026-04-11T12:05:00.000Z',
          sender: { username: 'System' }
        }
      ]
    }
  };
}

function installApiMocks(page, state) {
  return page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/chats' && req.method() === 'GET') {
      return fulfill({ ok: true, conversations: state.conversations, unread_total: 3 });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'GET') {
      const conversationId = url.searchParams.get('conversation_id') || '';
      return fulfill({ ok: true, messages: state.messages[conversationId] || [] });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const message = {
        id: `msg-${Date.now()}`,
        conversation_id: payload.conversation_id,
        sender_id: 'debug-user',
        content: payload.content,
        created_at: '2026-04-11T12:10:00.000Z',
        sender: { username: 'debugger' }
      };
      state.messages[payload.conversation_id] = [...(state.messages[payload.conversation_id] || []), message];
      state.conversations = state.conversations.map((item) =>
        item.id === payload.conversation_id
          ? {
              ...item,
              unread_count: 0,
              last_message: payload.content,
              last_sender_name: 'debugger',
              last_message_at: message.created_at
            }
          : item
      );
      return fulfill({ ok: true, message });
    }

    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/drive/info') return fulfill({ ok: true, stats: { quota_bytes: 0, used_bytes: 0, available_bytes: 0 } });
    if (pathname === '/api/community/drive/list') return fulfill({ ok: true, files: [] });
    if (pathname === '/api/nodes') return fulfill({ ok: true, nodes: [], sources: [], subscription_url: '/api/nodes/subscription?pwd=playwright-session', raw: '', clients: {} });

    return fulfill({ ok: true, users: [], groups: [], posts: [], messages: [], conversations: [], unread_total: 0 });
  });
}

test.beforeEach(async ({ page }) => {
  const state = buildChatsState();
  await page.addInitScript(() => {
    localStorage.setItem('siteTheme', 'theme-default');
    localStorage.setItem('commUser', JSON.stringify({
      id: 'debug-user',
      username: 'debugger',
      passHash: 'playwright-session',
      role: 'owner',
      xp: 999,
      level: 9
    }));
  });

  await installApiMocks(page, state);
});

test('console chats route loads through the runtime shell and keeps primary chrome visible', async ({ page }) => {
  const response = await page.goto('/console/chats?conversation=group-general');
  expect(response).not.toBeNull();
  expect(response.ok()).toBeTruthy();

  await expect(page.locator('header .header-avatar-shell')).toBeVisible();
  await expect(page.locator('#liquidBar')).toBeVisible();
  await expect(page).toHaveURL(/\/console\/chats\?conversation=group-general$/);
  await expect(page.locator('.chats-page')).toBeVisible();
  await expect(page.locator('#chats-title')).toHaveText('私聊与会话');
  await expect(page.getByRole('heading', { name: 'General Lounge' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: '欢迎回来' }).first()).toBeVisible();

  await page.locator('input[placeholder="说点什么…"]').fill('route smoke test');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.locator('article').filter({ hasText: 'route smoke test' }).last()).toBeVisible();
});
