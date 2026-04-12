const { test, expect } = require('@playwright/test');

function boardPosition(row, column, box) {
  const cellWidth = box.width / 9;
  const cellHeight = box.height / 10;
  return {
    x: box.x + cellWidth / 2 + column * cellWidth,
    y: box.y + cellHeight / 2 + row * cellHeight
  };
}

async function clickBoardCell(page, canvas, row, column) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('棋盘未渲染');
  const point = boardPosition(row, column, box);
  await page.mouse.click(point.x, point.y);
}

test.describe('xiangqi route', () => {
  test('direct /xiangqi route supports move, undo, and reset', async ({ page }) => {
    await page.goto('/xiangqi');

    await expect(page).toHaveURL(/\/xiangqi$/);
    await expect(page.getByRole('heading', { name: '象棋' })).toBeVisible();
    await expect(page.getByText('红方先行')).toBeVisible();
    await expect(page.getByText('轮到红方')).toBeVisible();

    const canvas = page.locator('canvas[aria-label="中国象棋棋盘"]');
    await expect(canvas).toBeVisible();

    await clickBoardCell(page, canvas, 6, 0);
    await clickBoardCell(page, canvas, 5, 0);
    await expect(page.getByText('黑方走子')).toBeVisible();
    await expect(page.getByText('轮到黑方')).toBeVisible();

    await page.getByRole('button', { name: '悔棋一步' }).click();
    await expect(page.getByText('红方走子')).toBeVisible();
    await expect(page.getByText('轮到红方')).toBeVisible();

    await page.getByRole('button', { name: '重新开局' }).click();
    await expect(page.getByText('红方先行')).toBeVisible();
    await expect(page.getByText('轮到红方')).toBeVisible();
  });
});
