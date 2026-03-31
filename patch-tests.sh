#!/bin/bash
find tests/e2e -type f -name "*.spec.js" -print0 | xargs -0 sed -i 's|await page.goto('/');|await page.goto('/');\n  if (await page.locator("button:has-text(\"Cyber Dark\")").isVisible({ timeout: 2000 })) {\n    await page.click("button:has-text(\"Cyber Dark\")");\n    await page.waitForTimeout(2000);\n  }|g'
