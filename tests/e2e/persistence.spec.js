// @ts-check
// Leaderboard persistence across reload, driven through the real UI by
// pre-seeding the save document (the game validates it on load).
import { test, expect } from '@playwright/test';

const SAVE = {
  leaderboard: [
    {
      distance: 2400,
      survivalTime: 431.5,
      initials: 'ZOE',
      reachedLA: false,
      achievedAt: '2026-07-01T10:00:00.000Z',
    },
    {
      distance: 1200,
      survivalTime: 240.1,
      initials: 'ABC',
      reachedLA: false,
      achievedAt: '2026-07-02T10:00:00.000Z',
    },
  ],
  longestSurvival: 431.5,
};

test.describe('persistence', () => {
  test('a stored leaderboard survives reload and renders ranked', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.evaluate((doc) => localStorage.setItem('otp.save.v1', JSON.stringify(doc)), SAVE);
    await page.reload();
    await page.click('#btn-menu-leaderboard');
    const rows = page.locator('#leaderboard-body tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('ZOE');
    await expect(rows.nth(0)).toContainText('2400 m');
    await expect(rows.nth(1)).toContainText('ABC');
    await expect(page.locator('#leaderboard-record')).toContainText('431.5');
  });

  test('corrupted stored data is discarded silently (REQ-ERR-006)', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.evaluate(() => localStorage.setItem('otp.save.v1', '{broken json'));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.reload();
    await page.click('#btn-menu-leaderboard');
    await expect(page.locator('#leaderboard-empty')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('menu shows the personal best from storage', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.evaluate((doc) => localStorage.setItem('otp.save.v1', JSON.stringify(doc)), SAVE);
    await page.reload();
    await expect(page.locator('#menu-best')).toContainText('2400 m');
  });
});
