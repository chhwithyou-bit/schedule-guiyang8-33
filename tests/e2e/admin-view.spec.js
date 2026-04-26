const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('siteTheme', 'theme-default');
    localStorage.setItem('commUser', JSON.stringify({
      id: 'owner-1',
      username: 'owner',
      authToken: 'playwright-session',
      role: 'owner',
      xp: 999,
      level: 9
    }));
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
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });

    if (pathname === '/api/community/admin/data') {
      return fulfill({
        ok: true,
        reports: [
          {
            id: 'report-1',
            target_type: 'post',
            target_id: 'post-9',
            reason: '恶意内容',
            user_id: 'user-1'
          }
        ],
        users: [
          {
            id: 'user-1',
            username: 'alpha',
            role: 'user',
            drive_used: 1024,
            drive_quota: 1024 * 1024 * 1024,
            is_banned: 0,
            avatar_url: ''
          }
        ],
        announcement: {
          content: '系统维护通知',
          updatedAt: '2026-04-03T00:00:00.000Z'
        }
      });
    }

    if (pathname === '/api/community/admin/action') {
      return fulfill({ ok: true });
    }

    return fulfill({ ok: true });
  });
});

test('admin view uses dark surfaces instead of white paper cards', async ({ page }) => {
  await page.goto('/');
  await page.locator('#liquidBar .liquid-trigger').click();
  await page.locator('#liquidBar .liquid-nav-btn', { hasText: '管理' }).click();

  await expect(page.getByText('管理后台')).toBeVisible();
  await expect(page.getByText('举报原因：恶意内容')).toBeVisible();

  const backgroundColor = await page.getByText('举报原因：恶意内容').evaluate((node) => {
    let current = node.parentElement;
    while (current && typeof current.className === 'string' && !current.className.includes('rounded')) {
      current = current.parentElement;
    }

    return current ? window.getComputedStyle(current).backgroundColor : '';
  });

  expect(backgroundColor).not.toBe('rgb(255, 255, 255)');
});
