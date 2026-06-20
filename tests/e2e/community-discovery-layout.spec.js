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
  await page.addInitScript((user) => {
    localStorage.setItem('commUser', JSON.stringify(user));
  }, {
    id: 'debug-user',
    username: 'debugger',
    authToken: 'playwright-session',
    role: 'user',
    xp: 12,
    level: 1
  });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });

    if (pathname === '/api/community/posts' && req.method() === 'GET') {
      const posts = Array.from({ length: 18 }, (_, index) =>
        buildPost(`post-${index + 1}`, `Long community post ${index + 1}`)
      );
      return fulfill({ ok: true, posts });
    }

    if (pathname === '/api/community/discovery' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        users: [
          {
            id: 'user-alice',
            username: 'Alice',
            signature: 'Late-night reviewer',
            avatar_url: '',
            role: 'user'
          }
        ]
      });
    }

    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });

    if (pathname === '/api/community/announcement') {
      return fulfill({
        ok: true,
        announcement: {
          content: 'Broadcast channel is live.',
          updatedAt: '2026-03-31T10:00:00.000Z'
        }
      });
    }

    return fulfill({
      ok: true,
      users: [],
      posts: []
    });
  });
});

async function settleTheme(page) {
  try {
    const btn = page.locator('button[data-theme-id="theme-default"]');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  } catch {}
}

test('community feed stays scrollable and shows live announcement', async ({ page }) => {
  await page.goto('/');
  await settleTheme(page);

  await expect(page.locator('.community-hero-shell button').first()).toBeVisible();
  await expect(page.locator('text=Broadcast channel is live.')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const wrapper = document.querySelector('.page-transition-wrapper');
    const cards = Array.from(document.querySelectorAll('.community-view article'));
    const lastCard = cards[cards.length - 1];
    const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;

    return {
      cardCount: cards.length,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      wrapperOverflowY: wrapperStyle?.overflowY || null,
      lastCardBottomAtTop: lastCard ? lastCard.getBoundingClientRect().bottom : null
    };
  });

  expect(metrics.cardCount).toBe(18);
  expect(metrics.wrapperOverflowY).toBe('visible');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.innerHeight);
  expect(metrics.lastCardBottomAtTop).toBeGreaterThan(metrics.innerHeight);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);

  const lastCardVisibleAtBottom = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.community-view article'));
    const lastCard = cards[cards.length - 1];
    if (!lastCard) return false;
    return lastCard.getBoundingClientRect().bottom <= window.innerHeight + 4;
  });

  expect(lastCardVisibleAtBottom).toBe(true);
});

test('discovery section shows users instead of retired chat and proxy hubs', async ({ page }) => {
  await page.goto('/');
  await settleTheme(page);

  await page.locator('.community-pill').nth(1).click();

  await expect(page.getByText('Alice')).toBeVisible();
  await expect(page.getByText('Night Sprint')).toHaveCount(0);
  await expect(page.getByText('群组')).toHaveCount(0);
  await expect(page.locator('text=代理节点')).toHaveCount(0);
});
