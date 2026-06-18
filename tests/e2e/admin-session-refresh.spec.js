const { test, expect } = require('@playwright/test');

async function bootApp(page) {
  await page.goto('/');
  try {
    const btn = page.locator('button[data-theme-id="theme-default"]');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  } catch {}
  await page.waitForSelector('#liquidBar');
}

test.beforeEach(async ({ page }) => {
  let meRequestCount = 0;
  let meResponseMode = 'admin';
  await page.addInitScript(() => {
    localStorage.setItem('commUser', JSON.stringify({
      id: 'member-1',
      username: 'member',
      authToken: 'playwright-session',
      role: 'user',
      xp: 120,
      level: 2
    }));
  });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/me') {
      meRequestCount += 1;
      if (meResponseMode === 'unauthorized') {
        return fulfill({ ok: false }, 401);
      }
      return fulfill({
        ok: true,
        user: {
          id: 'member-1',
          username: 'member',
          authToken: 'playwright-session',
          role: 'admin',
          xp: 180,
          level: 3
        }
      });
    }

    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/drive/info') {
      return fulfill({
        ok: true,
        stats: {
          quota_bytes: 1024 * 1024 * 1024,
          used_bytes: 128 * 1024 * 1024
        }
      });
    }
    if (pathname === '/api/community/drive/list') return fulfill({ ok: true, files: [] });
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });

    return fulfill({ ok: true });
  });

  page.__meRequestCount = () => meRequestCount;
  page.__setMeResponseMode = (nextMode) => {
    meResponseMode = nextMode;
  };
});

test('bootstrapped session refresh surfaces admin entry after role changes server-side', async ({ page }) => {
  await bootApp(page);

  await expect.poll(() => page.__meRequestCount()).toBeGreaterThan(0);
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const raw = localStorage.getItem('commUser');
      if (!raw) return null;
      return JSON.parse(raw).role || null;
    });
  }).toBe('admin');

  await page.locator('#liquidBar .liquid-trigger').click();

  await expect(page.locator('#liquidBar .liquid-nav-btn', { hasText: '管理' })).toBeVisible();
});

test('bootstrapped session refresh clears stale sessions when the token is rejected', async ({ page }) => {
  page.__setMeResponseMode('unauthorized');

  await bootApp(page);

  await expect.poll(() => page.__meRequestCount()).toBeGreaterThan(0);
  await expect.poll(async () => {
    return await page.evaluate(() => localStorage.getItem('commUser'));
  }).toBeNull();

  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await page.locator('#liquidBar .liquid-trigger').click();
  await expect(page.locator('#liquidBar .liquid-nav-btn', { hasText: '管理' })).toHaveCount(0);
});
