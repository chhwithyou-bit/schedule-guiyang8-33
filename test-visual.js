import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // We need to wait for 8787 since it's the wrangler one, let's load it
  await page.goto('http://localhost:8787', { waitUntil: 'networkidle' });

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'visual-initial.png' });

  await page.click('button:has-text("烟墨十样")');

  await page.waitForTimeout(400);
  await page.screenshot({ path: 'visual-during-click.png' });

  await page.waitForTimeout(5000);
  
  // Open music player to verify it's centered
  await page.click('#mp');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'visual-after.png' });

  await browser.close();
})();
