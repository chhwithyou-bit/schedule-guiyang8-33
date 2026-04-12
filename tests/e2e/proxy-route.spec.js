const { test, expect } = require('@playwright/test');

async function openProxy(page) {
  await page.goto('/proxy');
  try {
    const btn = page.locator('button[data-theme-id="theme-default"]');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await page.waitForSelector('#liquidBar');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/proxy-gemini' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      return fulfill({
        ok: true,
        echoed_contents_count: Array.isArray(body.contents) ? body.contents.length : 0,
        first_text: body.contents?.[0]?.parts?.[0]?.text || ''
      });
    }

    if (pathname === '/api/music') return fulfill([]);
    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/chats') return fulfill({ ok: true, conversations: [], unread_total: 0 });
    if (pathname === '/api/community/chats/messages') return fulfill({ ok: true, messages: [] });
    if (pathname === '/api/community/discovery') return fulfill({ ok: true, users: [], groups: [] });
    if (pathname === '/api/nodes') {
      return fulfill({
        ok: true,
        nodes: [],
        sources: [],
        subscription_url: '/api/nodes/subscription?pwd=playwright-session',
        raw: '',
        clients: {}
      });
    }
    if (pathname === '/api/community/drive/info') {
      return fulfill({
        ok: true,
        stats: {
          quota_bytes: 1024 * 1024 * 1024,
          used_bytes: 0
        }
      });
    }
    if (pathname === '/api/community/drive/list') return fulfill({ ok: true, files: [] });

    return fulfill({ ok: true });
  });
});

test('proxy route exposes a real tool page and forwards test payloads', async ({ page }) => {
  await openProxy(page);

  await expect(page.getByRole('heading', { name: '代理服务' })).toBeVisible();
  await expect(page.getByText('route-native 精简版')).toBeVisible();
  await expect(page.getByLabel('Gemini 代理请求体')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送测试请求' })).toBeVisible();

  await page.getByRole('button', { name: '发送测试请求' }).click();

  await expect(page.getByText('请求已完成')).toBeVisible();
  await expect(page.getByLabel('Gemini 代理原始响应')).toContainText('echoed_contents_count');
  await expect(page.getByLabel('Gemini 代理原始响应')).toContainText('route-native 精简版本');
  await expect(page.getByLabel('响应元数据')).toContainText('200');
  await expect(page.getByLabel('响应元数据')).toContainText('application/json');
});

test('proxy route blocks invalid JSON before hitting the API', async ({ page }) => {
  await openProxy(page);

  await page.getByLabel('Gemini 代理请求体').fill('{bad json');
  await page.getByRole('button', { name: '发送测试请求' }).click();

  await expect(page.getByRole('alert')).toContainText('请求体不是合法 JSON');
  await expect(page.getByText('请求未发送')).toBeVisible();
});
