import { expect, test } from '@playwright/test';

test('Arena starts, steers and pauses; Endless reaches results and replays', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  await expect(page.locator('#clock')).toHaveText('5:00');
  await expect(page.locator('#countdown')).toBeVisible();
  await expect(page.locator('#clock')).not.toHaveText('5:00', { timeout: 8000 });
  await page.keyboard.down('KeyD');
  await expect.poll(async () => Number(await page.locator('#mass').textContent()), { timeout: 10000 }).toBeGreaterThan(20);
  await page.keyboard.up('KeyD');
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await page.locator('#clock').textContent();
  await expect(page.locator('#clock')).toHaveText(paused!);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#clock')).not.toHaveText(paused!);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await expect(page.locator('#result-ranking li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('#mass')).toHaveText('20');
  expect(errors).toEqual([]);
});

test('settings persist and both themes fit the HUD at nine sizes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#volume').fill('0');
  await page.locator('#music').fill('0');
  await page.locator('#dark').check();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#volume')).toHaveValue('0');
  await expect(page.locator('#music')).toHaveValue('0');
  await expect(page.locator('#dark')).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  for (const theme of ['dark', 'light']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [932, 430], [768, 1024], [1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
        ['#theme-toggle', '#pause', '#attack', '#map-toggle'].every((selector) => {
          const bounds = document.querySelector(selector)!.getBoundingClientRect();
          return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
        }));
      expect(fits, theme + ' ' + width + '×' + height).toBe(true);
    }
    if (theme === 'dark') await page.locator('#theme-toggle').click();
  }
});

test('training advances after real steering', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn to Play' }).click();
  await expect(page.locator('#tutorial-task')).toContainText('Move your magnet');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => Number(await page.locator('#mass').textContent())).toBeGreaterThan(20);
  await page.keyboard.up('KeyD');
});
