const { test, expect } = require('@playwright/test');

const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

function buildPlaylist() {
  return [
    { name: 'Aurora Echo', artist: 'Nora', url: SILENT_AUDIO },
    { name: 'Late Signal', artist: 'Kite', url: SILENT_AUDIO },
    { name: 'Night Pulse', artist: 'Nora', url: SILENT_AUDIO },
    { name: 'Blue Static', artist: 'Moss', url: SILENT_AUDIO },
    { name: 'Glass Horizon', artist: 'Arden', url: SILENT_AUDIO },
    { name: 'Metro Sleep', artist: 'Kite', url: SILENT_AUDIO },
    { name: 'After Rain', artist: 'June', url: SILENT_AUDIO },
    { name: 'Zero Hour', artist: 'Vale', url: SILENT_AUDIO },
    { name: 'Signal Bloom', artist: 'Mira', url: SILENT_AUDIO },
    { name: 'Concrete Sky', artist: 'Rin', url: SILENT_AUDIO },
    { name: 'Cold Neon', artist: 'Mira', url: SILENT_AUDIO },
    { name: 'Quiet Exit', artist: 'Vale', url: SILENT_AUDIO }
  ];
}

test.beforeEach(async ({ page }) => {
  let playlist = buildPlaylist();

  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/music' && req.method() === 'GET') {
      return fulfill(playlist);
    }

    if (pathname === '/api/music' && req.method() === 'POST') {
      const payload = req.postDataJSON();
      if (payload.action === 'setList' && Array.isArray(payload.list)) {
        playlist = payload.list;
      }
      return fulfill({ ok: true });
    }

    if (pathname === '/api/schedule') {
      return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    }

    if (pathname === '/api/community/posts') return fulfill({ ok: true, posts: [] });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });

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
});

test('music widget list scrolls and filters tracks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mp-name')).toHaveText('Aurora Echo');

  await page.locator('#mp').click();
  await expect(page.locator('#mp')).toHaveClass(/open/);

  await page.locator('#mpb-list').click();
  const listArea = page.locator('#mp-list-area');
  await expect(listArea).toHaveClass(/show/);
  await expect(page.locator('#mp-list .mp-li')).toHaveCount(12);

  const metrics = await listArea.evaluate(el => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  const scrollTop = await listArea.evaluate(el => {
    el.scrollTop = Math.max(80, Math.floor((el.scrollHeight - el.clientHeight) / 2));
    return el.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);

  await page.locator('#mp-search').fill('nora');
  await expect(page.locator('#mp-list .mp-li')).toHaveCount(2);
  await expect(page.locator('#mp-list')).toContainText('Aurora Echo');
  await expect(page.locator('#mp-list')).toContainText('Night Pulse');

  await page.locator('#mp-search').fill('not-found');
  await expect(page.locator('#mp-list .mp-empty')).toHaveText('没有匹配的歌曲');
});
