const { test, expect } = require('@playwright/test');

function buildPosts() {
  return [
    {
      id: 'post-1',
      user_id: 'user-1',
      username: '测试同学',
      avatar_url: '',
      role: 'user',
      content: '这是用来验证社区详情页的首条动态。',
      media_json: '[]',
      like_count: 3,
      comment_count: 1,
      viewer_liked: false,
      created_at: '2026-03-28T10:00:00.000Z'
    }
  ];
}

function installApiMocks(page, posts) {
  return page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/community/posts' && req.method() === 'GET') {
      return fulfill({ ok: true, posts });
    }

    if (pathname === '/api/community/comments') {
      return fulfill({
        ok: true,
        comments: [
          {
            id: 'comment-1',
            user_id: 'user-2',
            username: '回帖同学',
            avatar_url: '',
            role: 'user',
            content: '这里是首条留言。',
            created_at: '2026-03-28T10:15:00.000Z'
          }
        ]
      });
    }

    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });

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

async function bootApp(page) {
  await page.goto('/');
  try {
    const btn = page.locator('button:has-text("Cyber Dark")');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
}

test.describe('8Community V5 Functionality Check', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page, buildPosts());
  });

  test('Aura Picker should appear on first visit', async ({ page }) => {
    await bootApp(page);
    await page.evaluate(() => localStorage.removeItem('siteTheme'));
    await page.reload();
    await expect(page.locator('h2:has-text("Pick Your Aura")')).toBeVisible({ timeout: 10000 });
  });

  test('Should switch views via Liquid Bar', async ({ page }) => {
    await bootApp(page);
    await page.waitForSelector('#liquidBar');

    await page.locator('#liquidBar .liquid-trigger').click();
    await page.getByRole('button', { name: /课表/ }).click();

    await expect(page.getByText('课程安排')).toBeVisible();
  });

  test('Community feed should load posts', async ({ page }) => {
    await bootApp(page);

    const postCard = page.locator('article').first();
    await expect(postCard).toBeVisible({ timeout: 15000 });
    await expect(postCard).toContainText('这是用来验证社区详情页的首条动态。');
  });

  test('Post Detail should open when clicking content', async ({ page }) => {
    await bootApp(page);

    const postCard = page.locator('article').first();
    await expect(postCard).toBeVisible();
    await postCard.locator('.cursor-pointer').click();
    await expect(page.locator('h2:has-text("这条内容")')).toBeVisible();
    await expect(page.locator('p.text-xl.leading-relaxed').filter({ hasText: '这是用来验证社区详情页的首条动态。' })).toBeVisible();
  });
});
