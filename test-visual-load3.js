import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.goto('http://localhost:8787');

  // click theme
  await page.click('button:has-text("烟墨十样")');

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'theme-500ms.png' });

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'theme-1000ms.png' });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'theme-2000ms.png' });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'theme-4000ms.png' });

  await context.close();
  await browser.close();
})();
