const { test, expect } = require('@playwright/test');

function buildCommunityState() {
  return {
    posts: [
      {
        id: 'post-1',
        user_id: 'user-1',
        username: '测试同学',
        avatar_url: '',
        background_url: 'https://images.example.com/wallpaper.jpg',
        signature: '今晚先把界面磨顺。',
        role: 'user',
        content: '这是用来验证社区详情页的首条动态。',
        media_json: '[]',
        like_count: 3,
        comment_count: 1,
        viewer_liked: false,
        created_at: '2026-03-28T10:00:00.000Z'
      }
    ],
    comments: [
      {
        id: 'comment-1',
        user_id: 'user-2',
        username: '回帖同学',
        avatar_url: '',
        background_url: '',
        signature: '正在跟进评论发布链路。',
        role: 'user',
        content: '这里是首条留言。',
        created_at: '2026-03-28T10:15:00.000Z'
      }
    ],
    reports: []
  };
}

function installApiMocks(page, state) {
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
      return fulfill({ ok: true, posts: state.posts });
    }

    if (pathname === '/api/community/profile' && req.method() === 'GET') {
      return fulfill({
        ok: true,
        user: {
          id: 'user-1',
          username: '测试同学',
          avatar_url: '',
          background_url: 'https://images.example.com/wallpaper.jpg',
          signature: '今晚先把界面磨顺。',
          level: 4,
          xp: 120,
          role: 'user',
          followers_count: 8,
          following_count: 5,
          viewer_is_following: false
        }
      });
    }

    if (pathname === '/api/community/comments' && req.method() === 'GET') {
      return fulfill({ ok: true, comments: state.comments });
    }

    if (pathname === '/api/community/comments' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const comment = {
        id: `comment-${state.comments.length + 1}`,
        user_id: 'viewer-user',
        username: '调试用户',
        avatar_url: '',
        background_url: '',
        signature: '把问题一个个收掉。',
        role: 'user',
        content: String(payload.content || '').trim(),
        created_at: '2026-03-28T10:30:00.000Z'
      };
      state.comments = [...state.comments, comment];
      state.posts = state.posts.map((post) => post.id === payload.post_id
        ? { ...post, comment_count: (post.comment_count || 0) + 1 }
        : post
      );
      return fulfill({ ok: true });
    }

    if (pathname === '/api/community/report' && req.method() === 'POST') {
      state.reports.push(req.postDataJSON());
      return fulfill({ ok: true });
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
    const btn = page.locator('button[data-theme-id="theme-default"]');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
}

test.describe('8Community V5 Functionality Check', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('commUser', JSON.stringify({
        id: 'viewer-user',
        username: '调试用户',
        passHash: 'playwright-session',
        role: 'user',
        signature: '把问题一个个收掉。'
      }));
    });

    await installApiMocks(page, buildCommunityState());
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

  test('Comment shortcut opens detail and publishes comment', async ({ page }) => {
    await bootApp(page);

    await page.getByRole('button', { name: '查看评论' }).click();
    await expect(page.locator('h2:has-text("这条内容")')).toBeVisible();
    await expect(page.locator('input[placeholder=\"想回一句什么，就写在这里。\"]')).toBeFocused();

    await page.getByPlaceholder('想回一句什么，就写在这里。').fill('这条评论是回归测试发出来的。');
    await page.getByRole('button', { name: '发布评论' }).click();

    await expect(page.getByText('这条评论是回归测试发出来的。')).toBeVisible();
  });

  test('Avatar opens profile with wallpaper and signature', async ({ page }) => {
    await bootApp(page);

    await page.getByRole('button', { name: '打开 测试同学 的主页' }).click();
    await expect(page.getByRole('heading', { name: '测试同学' }).first()).toBeVisible();
    await expect(page.getByText('今晚先把界面磨顺。').first()).toBeVisible();
    await expect(page.getByRole('link', { name: '查看壁纸' })).toBeVisible();
  });
});
