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

    if (pathname === '/api/nodes' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        nodes: [
          {
            id: 'node-1',
            name: 'HK Edge 01',
            raw: 'vmess://ZXhhbXBsZQ==',
            protocol: 'vmess',
            source_label: '主订阅'
          }
        ],
        sources: [
          {
            id: 'source-1',
            label: '主订阅',
            source_type: 'subscription',
            enabled: true,
            node_count: 1,
            updated_at: '2026-03-31T10:00:00.000Z'
          }
        ],
        subscription_url: '/api/nodes/subscription?pwd=playwright-session',
        raw: 'vmess://ZXhhbXBsZQ==',
        clients: {
          shadowrocket: 'shadowrocket://add/sub://example',
          clash: '/api/nodes/subscription?pwd=playwright-session'
        }
      });
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
    const btn = page.locator('button[data-theme-id="theme-default"]');
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

test('nodes view loads proxy hub instead of discovery recommendations', async ({ page }) => {
  await page.goto('/');
  await settleTheme(page);

  await page.locator('nav button:has-text("社区")').click();
  await page.locator('nav button:has-text("节点")').click();

  await expect(page.locator('text=代理节点')).toBeVisible();
  await expect(page.locator('input[placeholder="输入访问密码..."]')).toBeVisible();
  await page.locator('input[placeholder="输入访问密码..."]').fill('playwright-session');
  await page.locator('button:has-text("解锁节点")').click();

  await expect(page.locator('text=一键复制或直接打开')).toBeVisible();
  await expect(page.locator('text=HK Edge 01')).toBeVisible();
  await expect(page.getByRole('heading', { name: '主订阅' })).toBeVisible();
  await expect(page.locator('text=Shadowrocket')).toBeVisible();
});
