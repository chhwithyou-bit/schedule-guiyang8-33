const { test, expect } = require('@playwright/test');
const path = require('path');

function buildDriveState() {
  return {
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
    }
  };
}

test.beforeEach(async ({ page }) => {
  const state = buildDriveState();

  await page.addInitScript(user => {
    localStorage.setItem('commUser', JSON.stringify(user));
    localStorage.setItem('siteTheme', 'theme-default');
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
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });

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
      state.driveFiles.root = [uploaded, ...(state.driveFiles.root || [])];
      state.driveStats.used_bytes += uploaded.size;
      state.driveStats.available_bytes -= uploaded.size;
      return fulfill({ ok: true, id: uploaded.id, url: uploaded.url, file: uploaded, stats: state.driveStats });
    }

    return fulfill({ ok: true, users: [], groups: [], posts: [], messages: [], conversations: [], unread_total: 0 });
  });
});

test('console hub links to direct subroutes instead of opening a legacy modal shell', async ({ page }) => {
  await page.goto('/console');

  await expect(page.getByRole('heading', { name: '个人面板、消息、群组、网盘、提醒' })).toBeVisible();
  await expect(page.getByRole('link', { name: '私聊与会话' })).toHaveAttribute('href', '/console/chats');
  await expect(page.getByRole('link', { name: '群组与发现' })).toHaveAttribute('href', '/console/groups');
  await expect(page.getByRole('link', { name: '网盘与媒体' })).toHaveAttribute('href', '/console/drive');
  await expect(page.getByRole('link', { name: '互动提醒' })).toHaveAttribute('href', '/community/notifications');
});

test('drive route restores upload rename delete and media states on the direct URL', async ({ page }) => {
  await page.addInitScript(() => {
    window.prompt = (message, defaultValue = '') => {
      if (String(message).includes('新文件夹')) return 'Uploads';
      if (String(message).includes('改成什么名字')) return 'notes-renamed.txt';
      return defaultValue;
    };
    window.confirm = () => true;
  });

  await page.goto('/console/drive');

  await expect(page.getByRole('heading', { name: '文件与网盘空间' })).toBeVisible();
  await expect(page.getByText('notes.txt', { exact: true })).toBeVisible();
  await expect(page.getByText('Assets', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '新建文件夹' }).click();
  await page.getByLabel('文件夹名称').fill('Uploads');
  await page.getByRole('button', { name: '创建' }).click();
  await expect(page.getByText('Uploads', { exact: true })).toBeVisible();

  await page.locator('article').filter({ hasText: 'notes.txt' }).getByRole('button', { name: '改名' }).click();
  await page.getByLabel('新名称').fill('notes-renamed.txt');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('notes-renamed.txt', { exact: true })).toBeVisible();

  const uploadInput = page.locator('input[type="file"]').first();
  await uploadInput.setInputFiles(path.join(__dirname, '..', '..', 'public', 'favicon-32.png'));
  await expect(page.getByText('uploaded-image.png', { exact: true })).toBeVisible();

  await page.locator('article').filter({ hasText: 'Assets' }).getByRole('button', { name: '打开' }).click();
  await expect(page.getByText('poster.png', { exact: true })).toBeVisible();
  await expect(page.getByText('theme.mp3', { exact: true })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'theme.mp3' }).getByText(/媒体预览加载中|媒体可直接打开预览。/)).toBeVisible();

  await page.getByRole('button', { name: '根目录' }).click();
  await page.locator('article').filter({ hasText: 'notes-renamed.txt' }).getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.locator('article').filter({ has: page.getByText('notes-renamed.txt', { exact: true }) })).toHaveCount(0);
});

test('direct chats and groups routes are reachable without the legacy shell wrapper', async ({ page }) => {
  await page.goto('/console/chats');
  await expect(page.getByRole('heading', { name: '私聊与会话' })).toBeVisible();
  await expect(page).toHaveURL(/\/console\/chats$/);
  await page.locator('#liquidBar .liquid-trigger').click();
  await expect(page.locator('#liquidBar').getByRole('link', { name: /消息台/ })).toHaveAttribute('aria-current', 'page');

  await page.goto('/console/groups');
  await expect(page.getByRole('heading', { name: '群组与发现' })).toBeVisible();
  await expect(page).toHaveURL(/\/console\/groups$/);
});
