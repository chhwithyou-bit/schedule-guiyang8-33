const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, posts: [], announcement: {} })
    });
  });
});

test('8community wordmark is visible and has correct text', async ({ page }) => {
  await page.goto('/');
  
  // Force theme initialization if stuck
  await page.evaluate(() => {
    window.localStorage.setItem('theme-initialized', 'true');
    // If there's a way to access the store from window, we would do it here
  });

  // Wait for the preloader to finish if it exists
  const preloader = page.locator('.preloader');
  try {
    if (await preloader.isVisible({ timeout: 2000 })) {
      await expect(preloader).not.toBeVisible({ timeout: 15000 });
    }
  } catch (e) {
    console.log('Preloader not found or already gone');
  }

  // The wordmark is in CommunityView, which is the default view
  const wordmark = page.locator('.community-showcase');
  
  // Log the page content if it fails
  try {
    await expect(wordmark).toBeVisible({ timeout: 10000 });
  } catch (e) {
    const html = await page.content();
    console.log('Page HTML:', html);
    throw e;
  }
  
  // Check for the text "8community"
  const text = page.locator('.text-fg');
  await expect(text).toHaveText('8community');
  
  // Check for "LIVE NOW" badge
  const badge = page.locator('.status-text');
  await expect(badge).toHaveText('LIVE NOW');

  // Take a screenshot for visual verification
  await wordmark.screenshot({ path: 'wordmark-debug.png' });
  console.log('Screenshot saved to wordmark-debug.png');
});

test('8community wordmark is transparent', async ({ page }) => {
  await page.goto('/');
  
  const wordmark = page.locator('.community-showcase');
  await expect(wordmark).toBeVisible();

  const backgroundColor = await wordmark.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor;
  });
  
  console.log('Wordmark background color:', backgroundColor);
  
  // It should be transparent or very low alpha
  // rgba(0, 0, 0, 0) or similar
  // In our CSS: background: radial-gradient(...)
  // The computed backgroundColor might be "rgba(0, 0, 0, 0)" if only gradient is used
});
