const { test, expect } = require('@playwright/test');

async function settleTheme(page) {
  await page.addInitScript(() => {
    localStorage.setItem('siteTheme', 'theme-default');
    localStorage.setItem('commUser', JSON.stringify({
      id: 'viewer-user',
      username: '调试用户',
      passHash: 'playwright-session',
      role: 'user',
      signature: '把问题一个个收掉。'
    }));
  });
}

test.beforeEach(async ({ page }) => {
  await settleTheme(page);
});

test.describe('route-first migration parity', () => {
  test('community route is the stable primary entry instead of the legacy shell home', async ({ page }) => {
    await page.goto('/community');

    await expect(page.getByRole('heading', { name: '社区' })).toBeVisible();
    await expect(page.getByText('这里保留社区作为默认首页入口')).toBeVisible();
    await expect(page).toHaveURL(/\/community$/);
  });

  test('liquid bar quick jump switches between real top-level routes', async ({ page }) => {
    await page.goto('/community');

    await page.locator('#liquidBar .liquid-trigger').click();
    await page.getByRole('link', { name: /课表/ }).click();

    await expect(page.getByRole('heading', { name: '课表' })).toBeVisible();
    await expect(page).toHaveURL(/\/schedule$/);
  });

  test('post detail deep link preserves direct route identity', async ({ page }) => {
    await page.goto('/community/posts/post-2');

    await expect(page.getByRole('heading', { name: '帖子详情' })).toBeVisible();
    await expect(page.getByText('post-2', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/community\/posts\/post-2$/);
  });

  test('profile detail deep link preserves direct route identity', async ({ page }) => {
    await page.goto('/community/profiles/user-2');

    await expect(page.getByRole('heading', { name: '个人主页' })).toBeVisible();
    await expect(page.getByText('user-2', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/community\/profiles\/user-2$/);
  });

  test('console hub replaces the old all-in-one legacy modal entrypoint', async ({ page }) => {
    await page.goto('/console');

    await expect(page.getByRole('heading', { name: '消息、群组、网盘' })).toBeVisible();
    await expect(page.getByRole('link', { name: '私聊与会话' })).toBeVisible();
    await expect(page.getByRole('link', { name: '群组与发现' })).toBeVisible();
    await expect(page.getByRole('link', { name: '网盘与媒体' })).toBeVisible();
  });
});
