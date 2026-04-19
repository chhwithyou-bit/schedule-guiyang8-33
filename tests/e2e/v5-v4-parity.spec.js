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
      },
      {
        id: 'post-2',
        user_id: 'user-2',
        username: '第二位同学',
        avatar_url: '',
        background_url: '',
        signature: '第二条动态用来测滚动和切换。',
        role: 'user',
        content: '这是第二条动态，用来验证打开不同详情时滚动会重置。',
        media_json: '[]',
        like_count: 0,
        comment_count: 2,
        viewer_liked: false,
        created_at: '2026-03-28T11:00:00.000Z'
      }
    ],
    commentsByPost: {
      'post-1': [
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
      'post-2': [
        {
          id: 'comment-2',
          user_id: 'user-3',
          username: '第二位回帖同学',
          avatar_url: '',
          background_url: '',
          signature: '滚动要稳定。',
          role: 'user',
          content: '第二条动态下的第一条留言。',
          created_at: '2026-03-28T11:05:00.000Z'
        },
        {
          id: 'comment-3',
          user_id: 'user-4',
          username: '第三位回帖同学',
          avatar_url: '',
          background_url: '',
          signature: '信息展示要一致。',
          role: 'user',
          content: '第二条动态下的第二条留言。',
          created_at: '2026-03-28T11:10:00.000Z'
        }
      ]
    },
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
      const userId = url.searchParams.get('userId');
      const q = (url.searchParams.get('q') || '').trim();
      let filteredPosts = state.posts;

      if (userId) {
        filteredPosts = filteredPosts.filter((post) => post.user_id === userId);
      }

      if (q) {
        filteredPosts = filteredPosts.filter((post) => String(post.content || '').includes(q));
      }

      return fulfill({ ok: true, posts: filteredPosts });
    }

    if (pathname === '/api/community/profile' && req.method() === 'GET') {
      const profileId = url.searchParams.get('id') || 'user-1';
      const baseUser = state.posts.find((post) => post.user_id === profileId);
      return fulfill({
        ok: true,
        user: {
          id: profileId,
          username: baseUser?.username || '测试同学',
          avatar_url: baseUser?.avatar_url || '',
          background_url: baseUser?.background_url || '',
          signature: baseUser?.signature || '今晚先把界面磨顺。',
          level: profileId === 'user-2' ? 2 : 4,
          xp: profileId === 'user-2' ? 48 : 120,
          role: baseUser?.role || 'user',
          followers_count: profileId === 'user-2' ? 3 : 8,
          following_count: profileId === 'user-2' ? 7 : 5,
          viewer_is_following: false
        }
      });
    }

    if (pathname === '/api/community/comments' && req.method() === 'GET') {
      const postId = url.searchParams.get('postId') || 'post-1';
      return fulfill({ ok: true, comments: state.commentsByPost[postId] || [] });
    }

    if (pathname === '/api/community/comments' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const postId = String(payload.post_id || '');
      const existingComments = state.commentsByPost[postId] || [];
      const comment = {
        id: `comment-${existingComments.length + 1}`,
        user_id: 'viewer-user',
        username: '调试用户',
        avatar_url: '',
        background_url: '',
        signature: '把问题一个个收掉。',
        role: 'user',
        content: String(payload.content || '').trim(),
        created_at: '2026-03-28T10:30:00.000Z'
      };
      state.commentsByPost[postId] = [...existingComments, comment];
      state.posts = state.posts.map((post) => post.id === postId
        ? { ...post, comment_count: (post.comment_count || 0) + 1 }
        : post
      );
      return fulfill({ ok: true });
    }

    if (pathname === '/api/community/like' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      const postId = String(payload.post_id || '');
      let action = 'liked';
      state.posts = state.posts.map((post) => {
        if (post.id !== postId) return post;
        const nextLiked = !post.viewer_liked;
        action = nextLiked ? 'liked' : 'unliked';
        return {
          ...post,
          viewer_liked: nextLiked,
          like_count: Math.max(0, (post.like_count || 0) + (nextLiked ? 1 : -1))
        };
      });
      return fulfill({ ok: true, action });
    }

    if (pathname === '/api/community/follow' && req.method() === 'POST') {
      return fulfill({ ok: true, action: 'followed' });
    }

    if (pathname === '/api/community/chats/direct' && req.method() === 'POST') {
      return fulfill({ ok: true, conversation: { id: 'conversation-1' } });
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
    await page.addInitScript(() => {
      localStorage.removeItem('siteTheme');
    });
    await page.goto('/');
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

    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('这是用来验证社区详情页的首条动态。');
    await expect(cards.nth(1)).toContainText('这是第二条动态，用来验证打开不同详情时滚动会重置。');
  });

  test('Post detail opens with matching content and comment count', async ({ page }) => {
    await bootApp(page);

    const secondPost = page.locator('article').nth(1);
    await expect(secondPost).toBeVisible();
    await secondPost.locator('.cursor-pointer').click();

    await expect(page.locator('h2:has-text("这条内容")')).toBeVisible();
    await expect(page.locator('p.text-xl.leading-relaxed').filter({ hasText: '这是第二条动态，用来验证打开不同详情时滚动会重置。' })).toBeVisible();
    await expect(page.getByText('第二条动态下的第一条留言。')).toBeVisible();
    await expect(page.locator('h3').filter({ hasText: '留言' })).toContainText('(2)');
  });

  test('Comment shortcut opens detail, focuses composer, and syncs count', async ({ page }) => {
    await bootApp(page);

    await page.getByRole('button', { name: '查看评论' }).first().click();
    await expect(page.locator('h2:has-text("这条内容")')).toBeVisible();
    await expect(page.getByPlaceholder('想回一句什么，就写在这里。')).toBeVisible();

    await page.getByPlaceholder('想回一句什么，就写在这里。').fill('这条评论是回归测试发出来的。');
    await page.getByRole('button', { name: '发布评论' }).click();

    await expect(page.getByText('这条评论是回归测试发出来的。')).toBeVisible();
    await expect(page.locator('h3').filter({ hasText: '留言' })).toContainText('(2)');
    await page.getByRole('button', { name: '返回动态列表' }).click({ force: true });
    await expect(page.locator('article').first()).toContainText('2');
  });

  test('Report panel opens from shortcut and shows success feedback', async ({ page }) => {
    await bootApp(page);

    await page.getByRole('button', { name: '举报这条内容' }).first().click();
    await expect(page.getByRole('heading', { name: '把问题写清楚，我们会跟进处理。' })).toBeVisible();

    await page.getByPlaceholder('例如：辱骂、人身攻击、恶意广告、盗图。').fill('回归测试举报原因。');
    await page.getByRole('button', { name: '提交举报' }).click();

    await expect(page.getByText('举报已提交，我们会尽快处理。')).toBeVisible();
  });

  test('Profile opens from feed and profile posts stay consistent', async ({ page }) => {
    await bootApp(page);

    await page.getByRole('button', { name: '打开 测试同学 的主页' }).click();
    await expect(page.getByRole('heading', { name: '测试同学' }).first()).toBeVisible();
    await expect(page.getByText('今晚先把界面磨顺。').first()).toBeVisible();
    await expect(page.getByRole('link', { name: '查看壁纸' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /发过的内容/ })).toContainText('(1)');
    await expect(page.locator('article').last()).toContainText('这是用来验证社区详情页的首条动态。');
  });

  test('Switching detail targets resets scroll and updates visible thread', async ({ page }) => {
    await bootApp(page);

    await page.locator('article').first().locator('.cursor-pointer').click();
    const detailScroller = page.locator('.post-detail-shell .flex-1.overflow-y-auto');
    await expect(detailScroller).toBeVisible();
    await expect(page.getByText('这里是首条留言。')).toBeVisible();

    const secondFeedPost = page.locator('article').filter({ hasText: '这是第二条动态，用来验证打开不同详情时滚动会重置。' }).first();
    await secondFeedPost.getByRole('button', { name: '查看评论' }).evaluate((node) => {
      node.click();
    });

    await expect(page.locator('h3').filter({ hasText: '留言' })).toContainText('(2)');
    await expect(page.getByText('第二条动态下的第一条留言。')).toBeVisible();
    await expect(page.getByText('这里是首条留言。')).not.toBeVisible();
    await expect.poll(async () => detailScroller.evaluate((node) => node.scrollTop)).toBeLessThan(20);
  });

  test('Like updates detail/feed counts consistently', async ({ page }) => {
    await bootApp(page);

    const firstLikeButton = page.getByRole('button', { name: '点赞这条内容' }).first();
    await expect(firstLikeButton).toContainText('3');
    await firstLikeButton.click();
    await expect(firstLikeButton).toContainText('4');

    await page.locator('article').first().locator('.cursor-pointer').click();
    await expect(page.locator('h3').filter({ hasText: '留言' })).toBeVisible();
    await page.getByRole('button', { name: '返回动态列表' }).click({ force: true });
    await expect(firstLikeButton).toContainText('4');
  });
});
