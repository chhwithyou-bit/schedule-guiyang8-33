const { test, expect } = require('@playwright/test');

function buildCommunityState() {
  return {
    posts: [
      {
        id: 'post-1',
        user_id: 'user-1',
        username: 'Test Student',
        avatar_url: '',
        background_url: 'https://images.example.com/wallpaper.jpg',
        signature: 'Polishing the interface tonight.',
        role: 'user',
        content: 'First post used for detail regression coverage.',
        media_json: '[]',
        like_count: 3,
        comment_count: 1,
        viewer_liked: false,
        created_at: '2026-03-28T10:00:00.000Z'
      },
      {
        id: 'post-2',
        user_id: 'user-2',
        username: 'Second Student',
        avatar_url: '',
        background_url: '',
        signature: 'Second thread for scroll reset coverage.',
        role: 'user',
        content: 'Second post used to verify switching between detail threads.',
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
          username: 'Reply Student',
          avatar_url: '',
          background_url: '',
          signature: 'Tracking the comment pipeline.',
          role: 'user',
          content: 'First reply on the first post.',
          created_at: '2026-03-28T10:15:00.000Z'
        }
      ],
      'post-2': [
        {
          id: 'comment-2',
          user_id: 'user-3',
          username: 'Second Reply Student',
          avatar_url: '',
          background_url: '',
          signature: 'Scroll should stay stable.',
          role: 'user',
          content: 'First reply on the second post.',
          created_at: '2026-03-28T11:05:00.000Z'
        },
        {
          id: 'comment-3',
          user_id: 'user-4',
          username: 'Third Reply Student',
          avatar_url: '',
          background_url: '',
          signature: 'Thread switching should stay consistent.',
          role: 'user',
          content: 'Second reply on the second post.',
          created_at: '2026-03-28T11:10:00.000Z'
        }
      ]
    },
    reports: []
  };
}

function installApiMocks(page, state) {
  return page.route('**/api/**', async (route) => {
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
          username: baseUser?.username || 'Test Student',
          avatar_url: baseUser?.avatar_url || '',
          background_url: baseUser?.background_url || '',
          signature: baseUser?.signature || 'Polishing the interface tonight.',
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
        username: 'Debug User',
        avatar_url: '',
        background_url: '',
        signature: 'Closing regressions one by one.',
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

    if (pathname === '/api/community/posts/like' && req.method() === 'POST') {
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
      await page.waitForTimeout(1200);
    }
  } catch {}
}

test.describe('8Community V5 current functionality check', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('commUser', JSON.stringify({
        id: 'viewer-user',
        username: 'Debug User',
        passHash: 'playwright-session',
        role: 'user',
        signature: 'Closing regressions one by one.'
      }));
    });

    await installApiMocks(page, buildCommunityState());
  });

  test('first visit applies the default theme and boots the current shell', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('siteTheme');
    });

    await page.goto('/');
    await expect(page.locator('.app-background')).toHaveClass(/is-ready/, { timeout: 15000 });
    await expect(page.locator('.community-view')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('theme-default');
  });

  test('liquid bar switches into the personal view', async ({ page }) => {
    await bootApp(page);
    await page.waitForSelector('#liquidBar');

    await page.locator('#liquidBar .liquid-trigger').click();
    await page.locator('#liquidBar .liquid-nav-btn').nth(1).click();

    await expect(page.locator('.personal-shell')).toBeVisible();
  });

  test('community feed loads the mocked posts', async ({ page }) => {
    await bootApp(page);

    const cards = page.locator('.community-view article');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('First post used for detail regression coverage.');
    await expect(cards.nth(1)).toContainText('Second post used to verify switching between detail threads.');
  });

  test('post detail opens with matching content and comment count', async ({ page }) => {
    await bootApp(page);

    const secondPost = page.locator('.community-view article').nth(1);
    await expect(secondPost).toBeVisible();
    await secondPost.locator('button').nth(1).click();

    await expect(page.locator('.post-detail-shell')).toBeVisible();
    await expect(page.locator('.post-detail-content-panel')).toContainText('Second post used to verify switching between detail threads.');
    await expect(page.locator('.post-detail-comments')).toContainText('First reply on the second post.');
    await expect(page.locator('.post-detail-comments h3')).toContainText('(2)');
  });

  test('comment shortcut opens detail, focuses composer, and syncs count', async ({ page }) => {
    await bootApp(page);

    const firstPost = page.locator('.community-view article').first();
    await firstPost.locator('button').nth(3).click();
    const composer = page.locator('.post-detail-composer-input');
    await expect(composer).toBeVisible();
    await expect(composer).toBeFocused();

    await composer.fill('Regression comment from Playwright.');
    await page.locator('.post-detail-composer-submit').click();

    await expect(page.locator('.post-detail-comments')).toContainText('Regression comment from Playwright.');
    await expect(page.locator('.post-detail-comments h3')).toContainText('(2)');
    await page.locator('.post-detail-header button').first().click({ force: true });
    await expect(firstPost).toContainText('2');
  });

  test('report panel opens from the shortcut and shows success feedback', async ({ page }) => {
    await bootApp(page);

    const firstPost = page.locator('.community-view article').first();
    await firstPost.locator('button').nth(4).click();
    await expect(page.locator('.post-detail-report-panel')).toBeVisible();

    await page.locator('.post-detail-report-input').fill('Regression report reason.');
    await page.locator('.post-detail-report-submit').click();

    await expect(page.locator('.post-detail-message')).toBeVisible();
  });

  test('profile opens from feed and profile posts stay consistent', async ({ page }) => {
    await bootApp(page);

    const firstPost = page.locator('.community-view article').first();
    await firstPost.locator('button').first().click();

    await expect(page.getByRole('heading', { name: 'Test Student' }).first()).toBeVisible();
    await expect(page.getByText('Polishing the interface tonight.').first()).toBeVisible();
    await expect(page.locator('article').last()).toContainText('First post used for detail regression coverage.');
  });

  test('switching detail targets resets scroll and updates the visible thread', async ({ page }) => {
    await bootApp(page);

    const firstPost = page.locator('.community-view article').nth(0);
    const secondPost = page.locator('.community-view article').nth(1);

    await firstPost.locator('button').nth(1).click();
    const detailScroller = page.locator('.post-detail-scroll');
    await expect(detailScroller).toBeVisible();
    await expect(page.locator('.post-detail-comments')).toContainText('First reply on the first post.');

    await secondPost.locator('button').nth(3).evaluate((node) => {
      node.click();
    });

    await expect(page.locator('.post-detail-comments h3')).toContainText('(2)');
    await expect(page.locator('.post-detail-comments')).toContainText('First reply on the second post.');
    await expect(page.locator('.post-detail-comments')).not.toContainText('First reply on the first post.');
    await expect.poll(async () => detailScroller.evaluate((node) => node.scrollTop)).toBeLessThan(20);
  });

  test('like updates detail and feed counts consistently', async ({ page }) => {
    await bootApp(page);

    const firstPost = page.locator('.community-view article').first();
    const firstLikeButton = firstPost.locator('button').nth(2);

    await expect(firstLikeButton).toContainText('3');
    await firstLikeButton.click();
    await expect(firstLikeButton).toContainText('4');

    await firstPost.locator('button').nth(1).click();
    await expect(page.locator('.post-detail-shell')).toBeVisible();
    await page.locator('.post-detail-header button').first().click({ force: true });
    await expect(firstLikeButton).toContainText('4');
  });
});
