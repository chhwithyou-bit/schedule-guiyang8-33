import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const KEYBOARD_TOP = 520;
const baseURL = process.env.KEYBOARD_VERIFY_URL || 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const user = {
  id: 'debug-user',
  username: 'debugger',
  authToken: 'playwright-session',
  role: 'owner',
  avatar_url: '',
  background_url: '',
  signature: 'before save',
  xp: 999,
  level: 9
};

const post = {
  id: 'post-keyboard',
  user_id: 'debug-user',
  username: 'debugger',
  avatar_url: '',
  background_url: '',
  signature: 'before save',
  role: 'owner',
  content: 'Keyboard audit post',
  media_json: '[]',
  like_count: 0,
  comment_count: 0,
  favorite_count: 0,
  viewer_liked: false,
  viewer_favorited: false,
  can_delete: true,
  created_at: '2026-06-21T01:00:00.000Z'
};

async function setupPage(browser, authenticated = true) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await page.addInitScript(({ authenticated, user }) => {
    localStorage.setItem('siteTheme', 'theme-default');
    if (authenticated) localStorage.setItem('commUser', JSON.stringify(user));
    else localStorage.removeItem('commUser');
  }, { authenticated, user });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const fulfill = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (pathname === '/api/schedule') return fulfill({ ok: true, S: [], EV: {}, SJ: {} });
    if (pathname === '/api/community/announcement') return fulfill({ ok: true, announcement: null });
    if (pathname === '/api/community/discovery') return fulfill({ ok: true, users: [user] });
    if (pathname === '/api/community/posts' && req.method() === 'GET') return fulfill({ ok: true, posts: [post] });
    if (pathname === '/api/community/posts' && req.method() === 'POST') return fulfill({ ok: true });
    if (pathname === '/api/community/comments') return fulfill({ ok: true, comments: [] });
    if (pathname === '/api/community/notifications') return fulfill({ ok: true, notifications: [] });
    if (pathname === '/api/community/me') return fulfill({ ok: true, user });
    if (pathname === '/api/community/profile' && req.method() === 'GET') return fulfill({ ok: true, user });
    if (pathname === '/api/community/profile' && req.method() === 'POST') return fulfill({ ok: true, user });
    if (pathname === '/api/community/admin/data') {
      return fulfill({
        ok: true,
        reports: [],
        users: [user],
        announcement: { content: 'Existing announcement', updatedAt: '2026-06-21T01:00:00.000Z' },
        media_storage: {}
      });
    }
    if (pathname === '/api/community/admin/action') return fulfill({ ok: true });

    return fulfill({ ok: true, users: [], posts: [], comments: [], notifications: [] });
  });

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('.community-view').waitFor({ state: 'visible', timeout: 20000 });
  return page;
}

async function simulateKeyboard(page) {
  await page.evaluate((keyboardTop) => {
    document.documentElement.style.setProperty('--app-modal-viewport-top', '0px');
    document.documentElement.style.setProperty('--app-modal-viewport-height', `${keyboardTop}px`);
  }, KEYBOARD_TOP);
  await page.waitForTimeout(120);
}

async function check(page, locator, label, containerSelector = '') {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.focus();
  await page.waitForTimeout(300);

  const metrics = await locator.evaluate((node, selector) => {
    const target = selector ? node.closest(selector) : node;
    const box = (target || node).getBoundingClientRect();
    const inputBox = node.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      inputTop: inputBox.top,
      inputBottom: inputBox.bottom,
      active: document.activeElement === node,
      scrollY: window.scrollY
    };
  }, containerSelector);

  return {
    label,
    ok: metrics.inputBottom <= KEYBOARD_TOP + 2 && metrics.bottom <= KEYBOARD_TOP + 2,
    metrics
  };
}

async function runStep(label, fn, results) {
  try {
    await fn();
  } catch (error) {
    results.push({ label, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

const browser = await chromium.launch({ headless: true, executablePath });
const results = [];

try {
  await runStep('auth', async () => {
    const page = await setupPage(browser, false);
    await page.locator('.header-login-btn').click();
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('#username'), 'auth username', '.modal'));
    results.push(await check(page, page.locator('#password'), 'auth password', '.modal'));
    await page.close();
  }, results);

  await runStep('community search and post composer', async () => {
    const page = await setupPage(browser, true);
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('.community-search-input'), 'community search'));
    await page.locator('.composer').click();
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('.composer-input'), 'post composer', '.post-modal-shell'));
    await page.close();
  }, results);

  await runStep('post detail comment and report', async () => {
    const page = await setupPage(browser, true);
    await page.locator('article').first().click();
    await page.locator('[data-testid="post-detail"]').waitFor({ state: 'visible' });
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('[data-testid="comment-input"]'), 'comment composer', '.post-detail-shell'));
    await page.locator('.post-detail-pill-button').evaluate((node) => node.click());
    await page.locator('.post-detail-report-input').waitFor({ state: 'visible' });
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('.post-detail-report-input'), 'report composer', '.post-detail-shell'));
    await page.close();
  }, results);

  await runStep('profile signature', async () => {
    const page = await setupPage(browser, true);
    await page.locator('.header-avatar-shell').click();
    await page.locator('[data-testid="profile-view"]').waitFor({ state: 'visible' });
    await page.locator('.profile-info-card button').first().click({ force: true });
    await page.locator('[data-testid="profile-view"] textarea').waitFor({ state: 'visible' });
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('[data-testid="profile-view"] textarea').first(), 'profile signature'));
    await page.close();
  }, results);

  await runStep('admin announcement', async () => {
    const page = await setupPage(browser, true);
    await page.evaluate(() => { window.location.hash = '#/admin'; });
    await page.waitForTimeout(800);
    await page.locator('.admin-view').waitFor({ state: 'visible' });
    await page.locator('.admin-tab').nth(2).click();
    await page.locator('.admin-view textarea').waitFor({ state: 'visible' });
    await simulateKeyboard(page);
    results.push(await check(page, page.locator('.admin-view textarea').first(), 'admin announcement'));
    await page.close();
  }, results);
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));

const failures = results.filter((result) => !result.ok);
if (failures.length > 0) {
  throw new Error(`Keyboard audit failures: ${failures.map((failure) => `${failure.label}: ${failure.error || `bottom=${failure.metrics?.bottom} input=${failure.metrics?.inputBottom}`}`).join('; ')}`);
}
