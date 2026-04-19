const { test, expect } = require('@playwright/test');
const path = require('path');

async function openCommunityConsole(page) {
  await page.locator('nav button:has-text("社区")').click();

  const openButton = page.getByRole('button', { name: '打开控制台' });
  await openButton.scrollIntoViewIfNeeded();
  await page.locator('body').press('Escape').catch(() => {});
  await openButton.click();
}

async function dismissThemePicker(page) {
  try {
    const button = page.locator('button[data-theme-id="theme-default"]');
    if (await button.isVisible({ timeout: 2000 })) {
      await button.click();
      await page.waitForTimeout(1200);
    }
  } catch (e) {}
}

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
    driveStats: { quota_bytes: 10 * 1024 * 1024, used_bytes: 1024, available_bytes: 10 * 1024 * 1024 - 1024 },
    driveFiles: {
      root: [
        { id: 'dir-1', name: 'Assets', is_folder: 1, parent_id: null, updated_at: '2026-03-31T11:20:00.000Z' },
        { id: 'file-1', name: 'notes.txt', is_folder: 0, parent_id: null, size: 1024, mime_type: 'text/plain', url: '/files/notes.txt', updated_at: '2026-03-31T11:25:00.000Z' }
      ],
      'dir-1': [
        { id: 'image-1', name: 'poster.png', is_folder: 0, parent_id: 'dir-1', size: 2048, mime_type: 'image/png', url: '/media/poster.png', updated_at: '2026-03-31T11:26:00.000Z' },
        { id: 'audio-1', name: 'theme.mp3', is_folder: 0, parent_id: 'dir-1', size: 4096, mime_type: 'audio/mpeg', url: '/media/theme.mp3', updated_at: '2026-03-31T11:27:00.000Z' }
      ]
    },
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
      return fulfill({ ok: true, stats: state.driveStats });
    }

    if (pathname === '/api/community/drive/list') {
      const parentId = url.searchParams.get('parent_id');
      return fulfill({ ok: true, files: state.driveFiles[parentId || 'root'] || [] });
    }

    if (pathname === '/api/community/drive/mkdir' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const parentId = payload.parent_id || 'root';
      const folder = {
        id: `dir-${Date.now()}`,
        name: payload.name,
        is_folder: 1,
        parent_id: payload.parent_id || null,
        updated_at: '2026-03-31T11:50:00.000Z'
      };
      state.driveFiles[parentId] = [folder, ...(state.driveFiles[parentId] || [])];
      state.driveFiles[folder.id] = [];
      return fulfill({ ok: true, id: folder.id, folder });
    }

    if (pathname === '/api/community/drive/rename' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      Object.keys(state.driveFiles).forEach((key) => {
        state.driveFiles[key] = (state.driveFiles[key] || []).map((item) =>
          item.id === payload.id ? { ...item, name: payload.name, updated_at: '2026-03-31T11:55:00.000Z' } : item
        );
      });
      return fulfill({ ok: true, item: { id: payload.id, name: payload.name } });
    }

    if (pathname === '/api/community/drive/delete' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const ids = new Set(payload.ids || []);
      let freedBytes = 0;
      Object.keys(state.driveFiles).forEach((key) => {
        for (const item of state.driveFiles[key] || []) {
          if (ids.has(item.id) && !item.is_folder) freedBytes += item.size || 0;
        }
        state.driveFiles[key] = (state.driveFiles[key] || []).filter((item) => !ids.has(item.id));
      });
      state.driveStats.used_bytes -= freedBytes;
      state.driveStats.available_bytes += freedBytes;
      return fulfill({ ok: true, deleted: ids.size, freed_bytes: freedBytes, stats: state.driveStats });
    }

    if (pathname === '/api/community/drive/upload' && req.method() === 'POST') {
      const parentId = 'root';
      const uploaded = {
        id: `upload-${Date.now()}`,
        name: 'uploaded-image.png',
        is_folder: 0,
        parent_id: null,
        size: 3072,
        mime_type: 'image/png',
        url: '/media/uploaded-image.png',
        updated_at: '2026-03-31T12:00:00.000Z'
      };
      state.driveFiles[parentId] = [uploaded, ...(state.driveFiles[parentId] || [])];
      state.driveStats.used_bytes += uploaded.size;
      state.driveStats.available_bytes -= uploaded.size;
      return fulfill({ ok: true, id: uploaded.id, url: uploaded.url, file: uploaded, stats: state.driveStats });
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
  await dismissThemePicker(page);
  await openCommunityConsole(page);
  await expect(page.getByText('个人面板', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'debugger' })).toBeVisible();

  await page.locator('textarea').fill('after save');
  await page.locator('button:has-text("保存资料")').click();
  await expect(page.locator('text=资料已经保存好了。')).toBeVisible();

  await page.locator('.console-tab-card').filter({ hasText: '聊天' }).click();
  await expect(page.getByRole('heading', { name: 'General Lounge' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: '欢迎回来' }).first()).toBeVisible();
  await page.locator('input[placeholder="说点什么…"]').fill('console smoke test');
  await page.locator('button:has-text("发送")').click();
  await expect(page.locator('article').filter({ hasText: 'console smoke test' }).last()).toBeVisible();

  await page.locator('.console-tab-card').filter({ hasText: '群组' }).click();
  await expect(page.locator('article').filter({ hasText: 'General Lounge' }).filter({ hasText: '4 人' }).first()).toBeVisible();

  await page.locator('.console-tab-card').filter({ hasText: '网盘' }).click();
  await expect(page.locator('text=notes.txt')).toBeVisible();
  await expect(page.locator('text=Assets')).toBeVisible();
  await expect(page.locator('text=剩余可用')).toBeVisible();

  await page.locator('.console-tab-card').filter({ hasText: '提醒' }).click();
  await expect(page.locator('text=Alice 给你发来一条消息')).toBeVisible();
});

test('community console drive feedback covers upload rename delete and media states', async ({ page }) => {
  await page.addInitScript(() => {
    window.prompt = (message, defaultValue = '') => {
      if (String(message).includes('新文件夹')) return 'Uploads';
      if (String(message).includes('改成什么名字')) return 'notes-renamed.txt';
      return defaultValue;
    };
    window.confirm = () => true;
  });

  await page.goto('/');
  await dismissThemePicker(page);
  await openCommunityConsole(page);
  await page.locator('.console-tab-card').filter({ hasText: '网盘' }).click();

  await expect(page.locator('text=剩余可用')).toBeVisible();
  await page.locator('button:has-text("新建文件夹")').click();
  await expect(page.locator('text=已创建文件夹“Uploads”。')).toBeVisible();
  await expect(page.getByText('Uploads', { exact: true })).toBeVisible();

  await page.locator('article').filter({ hasText: 'notes.txt' }).getByRole('button', { name: '改名' }).click();
  await expect(page.locator('text=已将“notes.txt”改名为“notes-renamed.txt”。')).toBeVisible();
  const renamedRow = page.locator('article').filter({ has: page.getByText('notes-renamed.txt', { exact: true }) });
  await expect(renamedRow).toBeVisible();

  const uploadInput = page.locator('input[type="file"]').first();
  await uploadInput.setInputFiles(path.join(__dirname, '..', '..', 'public', 'favicon-32.png'));
  await expect(page.locator('text=“favicon-32.png”已上传，可继续整理或预览。')).toBeVisible();
  await expect(page.locator('text=uploaded-image.png')).toBeVisible();

  await page.locator('article').filter({ hasText: 'Assets' }).getByRole('button', { name: '打开' }).click();
  await expect(page.locator('text=poster.png')).toBeVisible();
  await expect(page.locator('text=theme.mp3')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'theme.mp3' }).getByText(/媒体预览加载中|媒体可直接打开预览。/)).toBeVisible();

  await page.locator('button:has-text("根目录")').click();
  await page.locator('article').filter({ hasText: 'notes-renamed.txt' }).getByRole('button', { name: '删除' }).click();
  await expect(page.locator('text=已删除“notes-renamed.txt”。')).toBeVisible();
  await expect(page.locator('article').filter({ has: page.getByText('notes-renamed.txt', { exact: true }) })).toHaveCount(0);
});

test('mobile: modal is fully scrollable and header is reachable', async ({ page }) => {
  // Simulate a typical mobile viewport (iPhone 14 size)
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  await dismissThemePicker(page);
  await openCommunityConsole(page);

  // The modal header must be visible (reachable by scrolling to top)
  const header = page.getByText('个人面板', { exact: true });
  await expect(header).toBeVisible({ timeout: 8000 });

  // Scroll to top of page to ensure the header isn't cut off
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).toBeVisible();

  // The close button must be reachable
  const closeBtn = page.locator('button:has-text("关闭")');
  await expect(closeBtn).toBeVisible();

  // Content further down (user profile heading) must also be reachable by scrolling
  const usernameHeading = page.getByRole('heading', { name: 'debugger' });
  await usernameHeading.scrollIntoViewIfNeeded();
  await expect(usernameHeading).toBeVisible();

  // Tab navigation must work on mobile
  await page.locator('.console-tab-card').filter({ hasText: '聊天' }).click();
  await page.locator('button').filter({ hasText: 'General Lounge' }).first().click();
  await expect(page.getByRole('heading', { name: 'General Lounge' })).toBeVisible();

  // Closing the modal must work
  await closeBtn.click();
  await expect(header).not.toBeVisible();
});

test('mobile: backdrop click closes modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  await dismissThemePicker(page);
  await openCommunityConsole(page);

  await expect(page.getByText('个人面板', { exact: true })).toBeVisible({ timeout: 8000 });

  // Click the backdrop (top-left corner, outside the card)
  await page.mouse.click(5, 5);
  await expect(page.getByText('个人面板', { exact: true })).not.toBeVisible();
});

test('console modal traps focus and returns focus on close', async ({ page }) => {
  await page.goto('/');
  await dismissThemePicker(page);

  await page.locator('nav button:has-text("社区")').click();
  const openButton = page.getByRole('button', { name: '打开控制台' });
  await openButton.scrollIntoViewIfNeeded();
  await page.locator('body').press('Escape').catch(() => {});
  await openButton.click();

  const dialog = page.getByRole('dialog', { name: '聊天 / 群组 / 网盘 / 提醒' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeFocused();

  const lastFocusable = dialog.getByRole('button', { name: '退出登录' });
  await page.keyboard.press('Shift+Tab');
  await expect(lastFocusable).toBeFocused({ timeout: 15000 });

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();
});
