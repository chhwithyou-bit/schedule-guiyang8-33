const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.spec.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');

      const toReplace = `await page.goto('/');`;
      const replacement = `await page.goto('/');
  try {
    const btn = page.locator('button:has-text("烟墨十样")');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {}`;

      content = content.replace(new RegExp("await page.goto\\('/');", 'g'), replacement);

      fs.writeFileSync(fullPath, content);
      console.log('patched', fullPath);
    }
  }
}

processDir('tests/e2e');
