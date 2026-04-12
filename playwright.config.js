const { defineConfig } = require('@playwright/test');

const port = Number(process.env.PLAYWRIGHT_PORT || 8787);
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1512, height: 982 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `PLAYWRIGHT_PORT=${port} npm run dev:test`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180000
  }
});
