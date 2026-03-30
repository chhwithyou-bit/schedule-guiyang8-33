import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // Add item to local storage before loading
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
     localStorage.setItem('siteTheme', 'theme-default');
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  await page.waitForTimeout(500);

  await page.screenshot({ path: 'has-theme-initial.png' });

  // wait for timeout
  await page.waitForTimeout(6000);

  await page.screenshot({ path: 'has-theme-after-6s.png' });

  await browser.close();
})();
