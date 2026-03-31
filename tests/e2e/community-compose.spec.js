const { test, expect } = require('@playwright/test');

function buildPost(id, content) {
  return {
    id,
    user_id: 'debug-user',
    username: 'debugger',
    avatar_url: '',
    role: 'user',
    created_at: '2026-03-31T02:00:00.000Z',
    content,
    media_json: '[]',
    like_count: 0,
    comment_count: 0,
    repost_count: 0,
    viewer_liked: false,
    xp: 12,
    level: 1
  };
}

test.beforeEach(async ({ page }) => {
  let posts = [];
  let sawAuthHeader = false;

  await page.addInitScript(user => {
    localStorage.setItem('commUser', JSON.stringify(user));
  }, {
    id: 'debug-user',
    username: 'debugger',
    passHash: 'playwright-session',
    role: 'user',
    xp: 12,
    level: 1
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

    if (pathname === '/api/music') {
      return fulfill([]);
    }

    if (pathname === '/api/schedule') {
      return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    }

    if (pathname === '/api/community/posts' && req.method() === 'GET') {
      return fulfill({ ok: true, posts });
    }

    if (pathname === '/api/community/posts' && req.method() === 'POST') {
      sawAuthHeader = req.headers()['authorization'] === 'Bearer debugger:playwright-session';
      const payload = req.postDataJSON();
      posts = [buildPost('post-debug-1', payload.content), ...posts];
      return fulfill({ ok: true });
    }

    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });

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

  await page.exposeFunction('didSeeComposeAuth', () => sawAuthHeader);
});

test('community composer is visible and posts with auth headers', async ({ page }) => {
  await page.goto('/');
  try {
    const btn = page.locator('button:has-text("Cyber Dark")');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  } catch (e) {}

  await expect(page.locator('button:has-text("发一条")')).toBeVisible();
  await page.locator('button:has-text("发一条")').click();

  const composer = page.locator('textarea[placeholder="今天想说什么，直接写下来。"]');
  await expect(composer).toBeVisible();
  await composer.fill('Playwright composer smoke test');
  await page.getByRole('button', { name: '发出去', exact: true }).click();

  await expect(page.locator('article')).toContainText('Playwright composer smoke test');
  await expect.poll(() => page.evaluate(() => window.didSeeComposeAuth())).toBe(true);
});
