const { test, expect } = require('@playwright/test');

const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
const WIDGET_SETTLE_MS = 760;

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

async function getAverageSearchSurfaceDiff(page, baselineShot, contrastShot, widgetBox, wrapBox) {
  return page.evaluate(async ({ baselineBase64, contrastBase64, widgetBox, wrapBox }) => {
    const decodeBitmap = async (base64) => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      const blob = await response.blob();
      return createImageBitmap(blob);
    };

    const [baselineBitmap, contrastBitmap] = await Promise.all([
      decodeBitmap(baselineBase64),
      decodeBitmap(contrastBase64)
    ]);

    const scaleX = baselineBitmap.width / widgetBox.width;
    const scaleY = baselineBitmap.height / widgetBox.height;
    const regionX = Math.min(
      baselineBitmap.width - 1,
      Math.max(0, Math.floor((wrapBox.x - widgetBox.x + 8) * scaleX))
    );
    const regionY = Math.min(
      baselineBitmap.height - 1,
      Math.max(0, Math.floor((wrapBox.y - widgetBox.y + 4) * scaleY))
    );
    const regionWidth = Math.max(
      1,
      Math.min(baselineBitmap.width - regionX, Math.ceil((wrapBox.width - 16) * scaleX))
    );
    const regionHeight = Math.max(
      1,
      Math.min(baselineBitmap.height - regionY, Math.ceil((wrapBox.height - 8) * scaleY))
    );

    const canvas = document.createElement('canvas');
    canvas.width = baselineBitmap.width;
    canvas.height = baselineBitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to create canvas context');

    ctx.drawImage(baselineBitmap, 0, 0);
    const baselineData = ctx.getImageData(regionX, regionY, regionWidth, regionHeight).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(contrastBitmap, 0, 0);
    const contrastData = ctx.getImageData(regionX, regionY, regionWidth, regionHeight).data;

    let totalDiff = 0;
    let pixelCount = 0;

    for (let index = 0; index < baselineData.length; index += 4) {
      totalDiff += Math.abs(baselineData[index] - contrastData[index]);
      totalDiff += Math.abs(baselineData[index + 1] - contrastData[index + 1]);
      totalDiff += Math.abs(baselineData[index + 2] - contrastData[index + 2]);
      pixelCount += 1;
    }

    return totalDiff / Math.max(1, pixelCount * 3);
  }, {
    baselineBase64: baselineShot.toString('base64'),
    contrastBase64: contrastShot.toString('base64'),
    widgetBox,
    wrapBox
  });
}

async function readWidgetState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('mp');
    if (!el) throw new Error('Missing music widget');
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);

    return {
      open: el.classList.contains('open'),
      originX: el.getAttribute('data-origin-x'),
      originY: el.getAttribute('data-origin-y'),
      left: parseFloat(computed.left || '0'),
      top: parseFloat(computed.top || '0'),
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  });
}

function expectPanelPositionStable(before, after, tolerance = 2) {
  expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(tolerance);
}

async function settleTheme(page) {
  try {
    const btn = page.locator('button[data-theme-id="theme-default"]');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
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

test('music widget list scrolls and filters tracks on /music', async ({ page }) => {
  await page.goto('/music');
  await settleTheme(page);
  await expect(page).toHaveURL(/\/music$/);
  await expect(page.getByRole('heading', { name: '音乐播放器' })).toBeVisible();
  await expect(page.locator('#mp-name')).toHaveText('Aurora Echo');

  await page.locator('#mp').click();
  await expect(page.locator('#mp')).toHaveClass(/open/);

  await page.locator('#mpb-list').click();
  const listArea = page.locator('#mp-list-area');
  await expect(listArea).toHaveClass(/show/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);
  await expect(page.locator('#mp-search')).toBeVisible();
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
  await expect(page.locator('#mp-list .mp-empty')).toHaveText('这次没搜到，换个词试试');
});

test('music search surface does not darken over bright blocks on /music', async ({ page }) => {
  await page.goto('/music');
  await settleTheme(page);
  await page.locator('#mp').click();
  await expect(page.locator('#mp')).toHaveClass(/open/);

  await page.locator('#mpb-list').click();
  await expect(page.locator('#mp-list-area')).toHaveClass(/show/);
  await expect(page.locator('.mp-search-wrap')).toBeVisible();
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const widget = page.locator('#mp');
  const widgetBox = await widget.boundingBox();
  const wrapBox = await page.locator('.mp-search-wrap').boundingBox();

  if (!widgetBox || !wrapBox) throw new Error('Failed to capture music widget bounds');

  const baselineShot = await widget.screenshot();

  await page.evaluate(() => {
    const target = document.getElementById('mp');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    let block = document.getElementById('mp-contrast-block');
    if (!block) {
      block = document.createElement('div');
      block.id = 'mp-contrast-block';
      document.body.appendChild(block);
    }
    Object.assign(block.style, {
      position: 'fixed',
      left: `${Math.floor(rect.left) - 8}px`,
      top: `${Math.floor(rect.top) - 8}px`,
      width: `${Math.ceil(rect.width) + 16}px`,
      height: `${Math.ceil(rect.height) + 16}px`,
      borderRadius: '26px',
      background: '#ffffff',
      zIndex: '10000',
      pointerEvents: 'none'
    });
  });

  await page.waitForTimeout(120);

  const contrastShot = await widget.screenshot();
  const averageDiff = await getAverageSearchSurfaceDiff(page, baselineShot, contrastShot, widgetBox, wrapBox);
  expect(averageDiff).toBeLessThan(96);
});

test('music widget can be dragged with the handle on /music', async ({ page }) => {
  await page.goto('/music');
  await settleTheme(page);

  const widget = page.locator('#mp');
  await widget.click();
  await expect(widget).toHaveClass(/open/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const before = await readWidgetState(page);
  const handle = page.locator('#mp-drag-handle');
  const collapseButton = page.getByRole('button', { name: '收起播放器' });

  const handleBox = await handle.boundingBox();
  const widgetBox = await widget.boundingBox();
  if (!handleBox) throw new Error('Missing music drag handle bounds');
  if (!widgetBox) throw new Error('Missing music widget bounds');

  const startX = handleBox.x + (handleBox.width / 2);
  const startY = handleBox.y + (handleBox.height / 2);
  const deltaX = widgetBox.x < (page.viewportSize()?.width || 0) / 2 ? 160 : -160;
  const deltaY = widgetBox.y > (page.viewportSize()?.height || 0) / 2 ? -80 : 80;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const after = await readWidgetState(page);

  expect(Math.abs(after.left - before.left)).toBeGreaterThan(80);

  await collapseButton.click();
  await expect(widget).not.toHaveClass(/open/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const collapsed = await readWidgetState(page);

  await page.locator('.mp-bubble').click();
  await expect(widget).toHaveClass(/open/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  await expect(collapseButton).toBeVisible();
  const reopened = await readWidgetState(page);
  expect(reopened.open).toBe(true);

  await collapseButton.click();
  await expect(widget).not.toHaveClass(/open/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);
  await expect(page.locator('.mp-bubble')).toBeVisible();
});

test.describe('music widget drag transition stability', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('music widget stays open when dragging begins during open transition on /music', async ({ page }) => {
    await page.goto('/music');
    try {
      const btn = page.locator('button[data-theme-id="theme-default"]');
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {}

    const widget = page.locator('#mp');
    await widget.click();
    await expect(widget).toHaveClass(/open/);
    await page.waitForTimeout(40);
    const before = await readWidgetState(page);

    const handle = page.locator('#mp-drag-handle');
    const box = await handle.boundingBox();
    if (!box) throw new Error('Missing drag handle bounds');

    const startX = box.x + (box.width / 2);
    const startY = box.y + (box.height / 2);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 24, startY - 24, { steps: 5 });

    const during = await readWidgetState(page);
    expect(during.open).toBe(true);
    expect(during.width).toBeGreaterThan(before.width - 2);

    await page.mouse.up();
    await page.waitForTimeout(120);
    await expect(widget).toHaveClass(/open/);

    const after = await readWidgetState(page);
    expect(after.open).toBe(true);
  });
});

test('music widget stays anchored when opening and toggling the list on /music', async ({ page }) => {
  await page.goto('/music');
  await settleTheme(page);

  const widget = page.locator('#mp');
  await expect(widget).toBeVisible();

  await widget.click();
  await expect(widget).toHaveClass(/open/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const opened = await readWidgetState(page);

  await page.locator('#mpb-list').click();
  await expect(page.locator('#mp-list-area')).toHaveClass(/show/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const listOpened = await readWidgetState(page);
  expectPanelPositionStable(opened, listOpened);

  await page.locator('#mpb-list').click();
  await expect(page.locator('#mp-list-area')).not.toHaveClass(/show/);
  await page.waitForTimeout(WIDGET_SETTLE_MS);

  const listClosed = await readWidgetState(page);
  expectPanelPositionStable(opened, listClosed);
});
