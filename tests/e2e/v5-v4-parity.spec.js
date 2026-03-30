const { test, expect } = require('@playwright/test');

// Note: v5 is currently served at v5-index.html in our development/worker setup
// We need to ensure the worker serves v5-index.html for our tests if possible, 
// or test the actual build output.

test.describe('8Community V5 Functionality Check', () => {
  
  test('Aura Picker should appear on first visit', async ({ page }) => {
    await page.goto('/');
    // Check if "Pick Your Aura" text is visible
    const heading = page.locator('h2:has-text("Pick Your Aura")');
    // If we haven't selected a theme, it should be there.
    // If the test runner already has a saved theme, it might not show.
    await page.evaluate(() => localStorage.removeItem('siteTheme'));
    await page.reload();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Should switch views via Liquid Bar', async ({ page }) => {
    await page.goto('/');
    // Close theme picker if it exists
    const defaultThemeBtn = page.locator('button:has-text("Cyber Dark")');
    if (await defaultThemeBtn.isVisible()) {
      await defaultThemeBtn.click();
    }

    // Locate the Liquid Bar button
    const navBtn = page.locator('button:has-text("COMMUNITY")');
    await expect(navBtn).toBeVisible();

    await navBtn.click();
    
    // Check for "Schedule" option
    const scheduleBtn = page.locator('button:has-text("Schedule")');
    await expect(scheduleBtn).toBeVisible();
    await scheduleBtn.click();

    // Verify Schedule view is active
    await expect(page.locator('h1:has-text("Schedule")')).toBeVisible();
  });

  test('Community feed should load posts', async ({ page }) => {
    await page.goto('/');
    // Close theme picker
    const defaultThemeBtn = page.locator('button:has-text("Cyber Dark")');
    if (await defaultThemeBtn.isVisible()) {
      await defaultThemeBtn.click();
    }

    // Community is default view in my recent changes
    const postCards = page.locator('article');
    // Wait for at least one post to load
    await expect(postCards.first()).toBeVisible({ timeout: 15000 });
  });

  test('Post Detail should open when clicking content', async ({ page }) => {
    await page.goto('/');
    const defaultThemeBtn = page.locator('button:has-text("Cyber Dark")');
    if (await defaultThemeBtn.isVisible()) {
      await defaultThemeBtn.click();
    }

    const firstPostContent = page.locator('article p').first();
    await firstPostContent.click();

    // Verify detail view heading
    await expect(page.locator('h2:has-text("Story Flow")')).toBeVisible();
  });
});
