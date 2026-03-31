const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  const state = {
    conversations: [
      {
        id: 'group-general',
        kind: 'group',
        title: 'General Lounge',
        description: '默认测试群组',
        member_count: 4,
        avatar_url: '',
        unread_count: 1,
        last_message: '欢迎回来',
        last_sender_name: 'System',
        last_message_at: '2026-03-31T11:30:00.000Z',
        updated_at: '2026-03-31T11:30:00.000Z'
      }
    ],
    messages: {
      'group-general': [
        {
          id: 'msg-1',
          conversation_id: 'group-general',
          sender_id: 'system',
          content: '欢迎回来',
          created_at: '2026-03-31T11:30:00.000Z',
          sender: { username: 'System' }
        }
      ]
    },
    driveRoot: [
      { id: 'dir-1', name: 'Assets', is_folder: 1, parent_id: null },
      { id: 'file-1', name: 'notes.txt', is_folder: 0, parent_id: null, size: 1024, mime_type: 'text/plain', url: '/files/notes.txt' }
    ],
    notifications: [
      { id: 'n-1', type: 'message', username: 'Alice', created_at: '2026-03-31T11:40:00.000Z' }
    ],
    savedProfile: null
  };

  await page.addInitScript(user => {
    localStorage.setItem('commUser', JSON.stringify(user));
  }, {
    id: 'debug-user',
    username: 'debugger',
    passHash: 'playwright-session',
    role: 'owner',
    xp: 999,
    level: 9,
    signature: 'before save'
  });

  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: state.notifications });

    if (pathname === '/api/community/chats' && req.method() === 'GET') {
      return fulfill({ ok: true, conversations: state.conversations, unread_total: 1 });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'GET') {
      const conversationId = url.searchParams.get('conversation_id');
      return fulfill({ ok: true, messages: state.messages[conversationId] || [] });
    }

    if (pathname === '/api/community/chats/messages' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const message = {
        id: `msg-${Date.now()}`,
        conversation_id: payload.conversation_id,
        sender_id: 'debug-user',
        content: payload.content,
        created_at: '2026-03-31T11:45:00.000Z',
        sender: { username: 'debugger' }
      };
      state.messages[payload.conversation_id] = [...(state.messages[payload.conversation_id] || []), message];
      state.conversations[0] = {
        ...state.conversations[0],
        last_message: payload.content,
        last_sender_name: 'debugger',
        unread_count: 0
      };
      return fulfill({ ok: true, message });
    }

    if (pathname === '/api/community/drive/info') {
      return fulfill({ ok: true, stats: { quota_bytes: 10 * 1024 * 1024, used_bytes: 1024 } });
    }

    if (pathname === '/api/community/drive/list') {
      const parentId = url.searchParams.get('parent_id');
      if (parentId === 'dir-1') return fulfill({ ok: true, files: [] });
      return fulfill({ ok: true, files: state.driveRoot });
    }

    if (pathname === '/api/community/profile' && req.method() === 'POST') {
      state.savedProfile = req.postDataJSON();
      return fulfill({ ok: true });
    }

    if (pathname === '/api/community/discovery') {
      return fulfill({ ok: true, users: [], groups: [] });
    }

    return fulfill({ ok: true, users: [], groups: [], posts: [], messages: [], conversations: [], unread_total: 0 });
  });
});

test('community console restores account, chat, and drive surfaces', async ({ page }) => {
  await page.goto('/');
  try {
    const btn = page.locator('button:has-text("Cyber Dark")');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  } catch (e) {}

  await page.locator('nav button:has-text("社区")').click();
  await page.locator('button:has-text("打开控制台")').click();
  await expect(page.getByText('个人面板', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'debugger' })).toBeVisible();

  await page.locator('textarea').fill('after save');
  await page.locator('button:has-text("保存资料")').click();
  await expect(page.locator('text=资料已经保存好了。')).toBeVisible();

  await page.locator('button:has-text("聊天")').click();
  await expect(page.getByRole('heading', { name: 'General Lounge' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: '欢迎回来' }).first()).toBeVisible();
  await page.locator('input[placeholder="说点什么…"]').fill('console smoke test');
  await page.locator('button:has-text("发送")').click();
  await expect(page.locator('article').filter({ hasText: 'console smoke test' }).last()).toBeVisible();

  await page.locator('button:has-text("群组")').click();
  await expect(page.locator('article').filter({ hasText: 'General Lounge' }).filter({ hasText: '4 人' }).first()).toBeVisible();

  await page.locator('button:has-text("网盘")').click();
  await expect(page.locator('text=notes.txt')).toBeVisible();
  await expect(page.locator('text=Assets')).toBeVisible();

  await page.locator('button:has-text("提醒")').click();
  await expect(page.locator('text=Alice 给你发来一条消息')).toBeVisible();
});
