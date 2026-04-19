const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const distIndexPath = path.join(repoRoot, 'v5-svelte-migration', 'dist', 'index.html');
const publicIndexPath = path.join(repoRoot, 'public', 'index.html');

function extractAssetReferences(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
}

async function installApiMocks(page) {
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
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/chats') return fulfill({ ok: true, conversations: [], unread_total: 0 });
    if (pathname === '/api/community/chats/messages') return fulfill({ ok: true, messages: [] });
    if (pathname === '/api/community/discovery') return fulfill({ ok: true, users: [], groups: [] });
    if (pathname === '/api/nodes') {
      return fulfill({
        ok: true,
        nodes: [],
        sources: [],
        subscription_url: '/api/nodes/subscription?pwd=playwright-session',
        raw: '',
        clients: {}
      });
    }
    if (pathname === '/api/community/drive/info') {
      return fulfill({
        ok: true,
        stats: {
          quota_bytes: 1024 * 1024 * 1024,
          used_bytes: 0
        }
      });
    }
    if (pathname === '/api/community/drive/list') return fulfill({ ok: true, files: [] });

    return fulfill({
      ok: true,
      posts: [],
      comments: [],
      messages: [],
      conversations: [],
      unread_total: 0,
      notifications: [],
      users: [],
      groups: []
    });
  });
}

async function openStartupShell(page) {
  await page.goto('/');
  await expect(page.locator('.preloader-overlay')).toBeVisible();
  await expect(page.getByText('opening sequence')).toBeVisible();
  await expect(page.locator('.app-background')).toHaveClass(/is-ready/, { timeout: 15000 });
  await expect(page.locator('.preloader-overlay')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('#liquidBar')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('siteTheme', 'theme-default');
  });

  await installApiMocks(page);
});

test('startup shell keeps wallpaper ready, preloader transient, and guest header entry visible', async ({ page }) => {
  await openStartupShell(page);

  await expect(page.locator('.app-background')).toHaveClass(/is-ready/);
  await expect(page.locator('header .site-header-shell')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: '账号入口' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: '登录', exact: true })).toBeVisible();
});

test('startup shell restores authenticated header controls after preloader completes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('commUser', JSON.stringify({
      id: 'debug-user',
      username: 'debugger',
      passHash: 'playwright-session',
      role: 'owner',
      xp: 999,
      level: 9
    }));
  });

  await openStartupShell(page);

  await expect(page.getByRole('banner').getByRole('button', { name: '个人', exact: true })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: '消息', exact: true })).toBeVisible();
  await expect(page.locator('header .header-avatar-shell')).toBeVisible();
});

test('served shell references the current built assets and drops stale public hashes', async ({ page }) => {
  const distHtml = fs.readFileSync(distIndexPath, 'utf8');
  const publicHtml = fs.readFileSync(publicIndexPath, 'utf8');
  const distAssets = extractAssetReferences(distHtml);
  const publicAssets = extractAssetReferences(publicHtml);

  expect(distAssets.length).toBeGreaterThan(0);
  expect(publicAssets).toEqual(distAssets);

  const response = await page.goto('/');
  expect(response).not.toBeNull();
  expect(response.ok()).toBeTruthy();

  const servedHtml = await page.content();
  const servedAssets = extractAssetReferences(servedHtml);
  expect(servedAssets).toEqual(distAssets);

  const publicAssetsDir = path.join(repoRoot, 'public', 'assets');
  const syncedAssetNames = fs.readdirSync(publicAssetsDir);
  const expectedAssetNames = distAssets.map((assetPath) => path.basename(assetPath));
  expect(syncedAssetNames.sort()).toEqual(expectedAssetNames.sort());

  for (const assetPath of distAssets) {
    await expect(page.locator(`head >> ${assetPath.endsWith('.css') ? `link[href="${assetPath}"]` : `script[src="${assetPath}"]`}`)).toHaveCount(1);
    const assetResponse = await page.request.get(assetPath);
    expect(assetResponse.ok()).toBeTruthy();
  }
});
