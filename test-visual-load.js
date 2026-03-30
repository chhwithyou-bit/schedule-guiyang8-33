import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  // record video to see the animation
  const context = await browser.newContext({
    recordVideo: {
      dir: 'videos/'
    }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // Go to page and don't wait for networkidle
  await page.goto('http://localhost:8787');

  // Wait 4 seconds to capture the full preloader + theme switcher transition
  await page.waitForTimeout(4000);

  await context.close();
  await browser.close();
})();
