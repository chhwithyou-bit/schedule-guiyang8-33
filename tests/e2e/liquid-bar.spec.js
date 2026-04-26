const { test, expect } = require('@playwright/test');

function buildState() {
  return {
    directUser: {
      id: 'user-alice',
      username: 'Alice',
      signature: 'Night shift co-op',
      avatar_url: '',
      role: 'user',
      xp: 220,
      level: 3
    },
    notifications: [
      {
        id: 'notif-1',
        type: 'comment_like',
        username: 'Alice',
        created_at: '2026-03-28T10:35:00.000Z'
      }
    ]
  };
}

function installApiMocks(page, state) {
  return page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/discovery' && req.method() === 'GET') {
      const users = [state.directUser].filter((user) => {
        if (!query) return true;
        return [user.username, user.signature].some((value) => String(value || '').toLowerCase().includes(query));
      });
      return fulfill({ ok: true, users });
    }

    if (pathname === '/api/community/notifications') {
      return fulfill({ ok: true, notifications: state.notifications });
    }

    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
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
    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });

    return fulfill({
      ok: true,
      users: [],
      posts: []
    });
  });
}

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
  const state = buildState();
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

test('liquid bar expands and switches between the current top-level views', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  const panel = page.locator('#liquidBar .liquid-panel');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');

  await page.locator('#liquidBar .liquid-nav-btn').nth(1).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(page.locator('.personal-shell')).toBeVisible();

  await trigger.click();
  await expect(panel).toBeVisible();
  await page.locator('#liquidBar .liquid-nav-btn').nth(0).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.community-view')).toBeVisible();
});

test('liquid bar keeps current utility actions reachable', async ({ page }) => {
  await bootApp(page);

  const trigger = page.locator('#liquidBar .liquid-trigger');
  await trigger.click();
  await page.locator('#liquidBar .liquid-compose-btn').click();
  await expect(page.locator('[data-modal-shell="true"]')).toBeVisible();

  await page.reload();
  await bootApp(page);

  await page.locator('#liquidBar .liquid-trigger').click();
  await page.locator('#liquidBar [data-liquid-target="notifications"]').click();
  await expect(page.locator('#liquidBar .liquid-panel')).toBeHidden();
  await expect(page.locator('.console-panel')).toContainText('Alice');
  await expect(page.locator('.console-tab-card')).toHaveCount(1);
  await expect(page.locator('#liquidBar [data-liquid-target="messages"]')).toHaveCount(0);
});

test('liquid bar stays keyboard-closeable from the trigger', async ({ page }) => {
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

  test('touching the dock opens the panel and still allows switching into personal view', async ({ page }) => {
    await bootApp(page);

    const trigger = page.locator('#liquidBar .liquid-trigger');
    const panel = page.locator('#liquidBar .liquid-panel');
    await trigger.tap();
    await expect(panel).toBeVisible();

    await page.locator('#liquidBar .liquid-nav-btn').nth(1).tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await expect(page.locator('.personal-shell')).toBeVisible();
  });
});
