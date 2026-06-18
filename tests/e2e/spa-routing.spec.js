const { test, expect } = require('@playwright/test');

function buildState() {
  return {
    posts: [
      {
        id: 'post-1',
        user_id: 'user-1',
        username: 'Test Student',
        avatar_url: '',
        signature: 'Hash-route coverage account.',
        role: 'user',
        content: 'Feed content for SPA routing checks.',
        media_json: '[]',
        like_count: 2,
        comment_count: 0,
        favorite_count: 1,
        viewer_favorited: true,
        viewer_liked: false,
        can_delete: false,
        created_at: '2026-04-01T10:00:00.000Z'
      }
    ],
    users: [
      {
        id: 'user-1',
        username: 'Test Student',
        avatar_url: '',
        signature: 'Hash-route coverage account.',
        role: 'user'
      }
    ],
    notifications: [
      {
        id: 'notif-1',
        type: 'comment_like',
        username: 'Test Student',
        created_at: '2026-04-01T11:00:00.000Z'
      }
    ]
  };
}

function installApiMocks(page, state) {
  return page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const favoritesOnly = url.searchParams.get('favorites') === '1' || url.searchParams.get('bookmarked') === '1';

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/posts' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        posts: favoritesOnly ? state.posts.filter((post) => post.viewer_favorited) : state.posts
      });
    }

    if (pathname === '/api/community/discovery') {
      return fulfill({ ok: true, users: state.users });
    }

    if (pathname === '/api/community/profile') {
      return fulfill({
        ok: true,
        user: {
          id: 'viewer-user',
          username: 'Debug User',
          avatar_url: '',
          signature: 'Testing route restoration.',
          level: 4,
          xp: 120,
          followers_count: 3,
          following_count: 5
        }
      });
    }

    if (pathname === '/api/community/notifications') {
      return fulfill({ ok: true, notifications: state.notifications });
    }

    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/drive/info') {
      return fulfill({
        ok: true,
        stats: {
          quota_bytes: 1024 * 1024 * 1024,
          used_bytes: 64 * 1024 * 1024
        }
      });
    }
    if (pathname === '/api/community/drive/list') return fulfill({ ok: true, files: [] });
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });

    return fulfill({ ok: true, posts: [], users: [], notifications: [] });
  });
}

async function bootRoute(page, hash) {
  await page.goto(`/${hash}`);
  const preloader = page.locator('.preloader-overlay');
  if (await preloader.isVisible().catch(() => false)) {
    await expect(preloader).toBeHidden({ timeout: 15000 });
  }
  await expect(page.locator('.app-background')).toHaveClass(/is-ready/, { timeout: 15000 });
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('#liquidBar')).toBeVisible();
}

test.describe('SPA hash routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('siteTheme', 'theme-default');
      localStorage.setItem('commUser', JSON.stringify({
        id: 'viewer-user',
        username: 'Debug User',
        authToken: 'playwright-session',
        role: 'owner',
        signature: 'Testing route restoration.',
        xp: 320,
        level: 4
      }));
    });

    await installApiMocks(page, buildState());
  });

  test('direct hash routes boot into the matching SPA surface', async ({ page }) => {
    await bootRoute(page, '#/profile');
    await expect(page.locator('.personal-shell')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/profile');

    await bootRoute(page, '#/community/favorites');
    await expect(page.locator('.community-view')).toBeVisible();
    await expect(page.locator('.community-view article')).toHaveCount(1);
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/community/favorites');
  });

  test('SPA navigation updates hash and browser back restores the previous route', async ({ page }) => {
    await bootRoute(page, '#/community');

    await page.locator('#liquidBar .liquid-trigger').click();
    await page.locator('#liquidBar .liquid-nav-btn').nth(1).click();
    await expect(page.locator('.personal-shell')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/profile');

    await page.goBack();
    await expect(page.locator('.community-view').first()).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/community');

    await page.locator('#liquidBar .liquid-trigger').click();
    await page.locator('#liquidBar [data-liquid-target="notifications"]').click();
    await expect(page.locator('.console-panel')).toContainText('Test Student');
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/community/notifications');
  });
});
