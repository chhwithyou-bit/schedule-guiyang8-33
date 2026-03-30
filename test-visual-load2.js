import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.goto('http://localhost:8787');

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'load-500ms.png' });

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'load-1000ms.png' });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'load-2000ms.png' });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'load-3000ms.png' });

  await context.close();
  await browser.close();
})();
