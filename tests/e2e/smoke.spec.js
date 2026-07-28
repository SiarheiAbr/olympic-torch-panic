// @ts-check
// Core browser journeys: menu -> run -> pause behaviors -> quit.
import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('menu renders and a run starts with HUD visible', async ({ page }) => {
    await page.goto('/?seed=42');
    await expect(page.locator('#screen-menu')).toBeVisible();
    await page.click('#btn-start');
    await expect(page.locator('#screen-menu')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hud-distance')).toContainText('m');
    await expect(page.locator('#hud-environment')).toHaveText('Countryside Send-off');
  });

  test('flame health indicator renders in the HUD during a run', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.click('#btn-start');
    await expect(page.locator('#hud-flame')).toBeVisible();
    await page.waitForTimeout(400);
    // the canvas must actually be painted (some non-transparent pixels)
    const painted = await page.locator('#hud-flame').evaluate((el) => {
      const canvas = /** @type {HTMLCanvasElement} */ (el);
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
      return false;
    });
    expect(painted).toBe(true);
  });

  test('distance accrues automatically', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.click('#btn-start');
    await page.waitForTimeout(1500);
    const text = await page.locator('#hud-distance').textContent();
    expect(parseInt(text, 10)).toBeGreaterThan(3);
  });

  test('Escape pauses; resume runs the countdown before gameplay continues', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.click('#btn-start');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay-pause')).toBeVisible();
    const pausedDistance = await page.locator('#hud-distance').textContent();
    await page.waitForTimeout(700);
    expect(await page.locator('#hud-distance').textContent()).toBe(pausedDistance);
    await page.click('#btn-resume');
    await expect(page.locator('#overlay-countdown')).toBeVisible();
    // still frozen during the countdown (REQ-ERR-003)
    expect(await page.locator('#hud-distance').textContent()).toBe(pausedDistance);
    await expect(page.locator('#overlay-countdown')).toBeHidden({ timeout: 4500 });
    await page.waitForTimeout(600);
    expect(await page.locator('#hud-distance').textContent()).not.toBe(pausedDistance);
  });

  test('How to Play opens from the menu and closes back to it', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.click('#btn-menu-howto');
    await expect(page.locator('#screen-howto')).toBeVisible();
    await expect(page.locator('#screen-howto h2')).toHaveText('How to Play');
    await expect(page.locator('.howto-hazards li')).toHaveCount(5);
    await page.click('#btn-howto-back');
    await expect(page.locator('#screen-howto')).toBeHidden();
    await expect(page.locator('#screen-menu')).toBeVisible();
  });

  test('quit from pause returns to the menu without recording a score', async ({ page }) => {
    await page.goto('/?seed=42');
    await page.click('#btn-start');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.click('#btn-quit');
    await expect(page.locator('#screen-menu')).toBeVisible();
    await page.click('#btn-menu-leaderboard');
    await expect(page.locator('#leaderboard-empty')).toBeVisible();
  });

  test('mouse movement rotates the torch (debug overlay reads the angle)', async ({ page }) => {
    await page.goto('/?seed=42&debug=1');
    await page.click('#btn-start');
    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(120);
    await expect(page.locator('#debug-overlay')).toContainText('torch 90.0');
    await page.mouse.move(box.x + box.width - 1, box.y + box.height * 0.5);
    await page.waitForTimeout(120);
    const text = await page.locator('#debug-overlay').textContent();
    expect(text).toMatch(/torch 0\.\d/);
  });

  test('a full session logs no console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/?seed=42');
    await page.click('#btn-start');
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    await page.click('#btn-quit');
    await page.click('#btn-menu-leaderboard');
    await page.click('#btn-leaderboard-back');
    expect(errors).toEqual([]);
  });
});
