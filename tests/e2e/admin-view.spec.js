const { test, expect } = require('@playwright/test');

async function mockApi(page) {
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });

    if (pathname === '/api/community/admin/data') {
      return fulfill({
        ok: true,
        reports: [
          {
            id: 'report-1',
            target_type: 'post',
            target_id: 'post-9',
            reason: '恶意内容',
            user_id: 'user-1'
          }
        ],
        users: [
          {
            id: 'user-1',
            username: 'alpha',
            role: 'user',
            drive_used: 1024,
            drive_quota: 1024 * 1024 * 1024,
            is_banned: 0,
            avatar_url: ''
          }
        ],
        announcement: {
          content: '系统维护通知',
          updatedAt: '2026-04-03T00:00:00.000Z'
        },
        node_sources: [
          {
            id: 'source-1',
            label: '校园订阅',
            source_type: 'subscription',
            node_count: 1,
            updated_at: '2026-04-03T00:00:00.000Z'
          }
        ],
        proxy_nodes: [
          {
            name: 'Guiyang Relay',
            protocol: 'vmess',
            source_label: '校园订阅',
            raw: 'vmess://example'
          }
        ],
        nodes_password_configured: true
      });
    }

    if (pathname === '/api/community/admin/action') {
      return fulfill({ ok: true });
    }

    return fulfill({ ok: true });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('siteTheme', 'theme-default');
    localStorage.removeItem('commUser');
  });

  await mockApi(page);
});

test('admin route renders migrated admin console for owner users', async ({ page }) => {
  await page.addInitScript((role) => {
    localStorage.removeItem('commUser');
    localStorage.setItem('commUser', JSON.stringify({
      id: `${role}-1`,
      username: role,
      passHash: 'playwright-session',
      role,
      xp: 999,
      level: 9
    }));
  }, 'owner');

  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '管理后台' })).toBeVisible();
  await expect(page.getByText('举报原因：恶意内容')).toBeVisible();
  await expect(page.getByLabel('管理后台概览统计')).toContainText('待处理举报');
  await page.getByRole('button', { name: '节点', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已配置来源' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '校园订阅' })).toBeVisible();

  await expect(page.locator('.admin-card').first()).toBeVisible();
});

test('admin route hides management content from non-admin users', async ({ page }) => {
  await page.addInitScript((role) => {
    localStorage.removeItem('commUser');
    localStorage.setItem('commUser', JSON.stringify({
      id: `${role}-1`,
      username: role,
      passHash: 'playwright-session',
      role,
      xp: 999,
      level: 9
    }));
  }, 'user');

  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '管理后台' })).toBeVisible();
  await expect(page.getByText('当前账号没有管理权限。')).toBeVisible();
  await expect(page.getByText('举报原因：恶意内容')).toHaveCount(0);
});

test('admin route asks guests to log in before entering', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: '管理后台' })).toBeVisible();
  await expect(page.getByText('请先登录社区账号，再进入 /admin。')).toBeVisible();
  await expect(page.getByText('举报原因：恶意内容')).toHaveCount(0);
});
