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
      const posts = Array.from({ length: 18 }, (_, index) =>
        buildPost(`post-${index + 1}`, `Long community post ${index + 1}`)
      );
      return fulfill({ ok: true, posts });
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

    if (pathname === '/api/community/discovery') {
      return fulfill({
        ok: true,
        users: [
          { id: 'u1', username: 'Atlas', signature: 'building routes', level: 4, xp: 120, role: 'user' },
          { id: 'u2', username: 'Nova', signature: 'debugging layouts', level: 6, xp: 220, role: 'owner' }
        ],
        groups: [
          { id: 'g1', title: 'Layout Lab', description: 'Fix cut layouts', member_count: 13, joined: false },
          { id: 'g2', title: 'Sound Dock', description: 'Tune player UX', member_count: 9, joined: false }
        ]
      });
    }

    if (pathname === '/api/community/groups/join' && req.method() === 'POST') {
      return fulfill({ ok: true });
    }

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
});

async function settleTheme(page) {
  try {
    const btn = page.locator('button:has-text("Cyber Dark")');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  } catch (e) {}
}

test('community feed stays scrollable and shows live announcement', async ({ page }) => {
  await page.goto('/');
  await settleTheme(page);

  await expect(page.locator('button:has-text("发一条")')).toBeVisible();
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

test('nodes view loads discovery results and can join groups', async ({ page }) => {
  await page.goto('/');
  await settleTheme(page);

  await page.locator('nav button:has-text("社区")').click();
  await page.locator('nav button:has-text("节点")').click();

  await expect(page.locator('text=找人和群')).toBeVisible();
  await expect(page.locator('text=Atlas')).toBeVisible();
  await expect(page.locator('text=Layout Lab')).toBeVisible();

  await page.locator('button:has-text("加入这个群")').first().click();
  await expect(page.locator('text=已加入 Layout Lab')).toBeVisible();
  await expect(page.locator('button:has-text("已加入")').first()).toBeVisible();
});
