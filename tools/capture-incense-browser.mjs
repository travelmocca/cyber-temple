import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
try {
  for (const side of process.env.SIDE ? [process.env.SIDE] : ['source', 'local']) {
    const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191',
      dir = new URL(`../RECON/mirror/comparisons/${side}-incense/`, import.meta.url);
    await mkdir(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
      recordVideo: { dir: fileURLToPath(dir), size: { width: 960, height: 540 } },
    });
    const p = await ctx.newPage();
    let result = { side, steps: [], errors: [] };
    p.on('pageerror', (e) => result.errors.push(e.message));
    try {
      await p.goto(base + '/?room=maru-20');
      await p.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
      await p.waitForFunction(
        () => document.querySelector('canvas[data-engine]')?.dataset.position,
      );
      await p.locator('#village-places').click();
      await p.locator('[data-place=gate]').click();
      await p.waitForTimeout(300);
      await p.waitForFunction(
        () => !document.querySelector('canvas[data-engine]').dataset.destination,
        null,
        { timeout: 30000 },
      );
      await p.locator('#village-places').click();
      await p.locator('[data-place=hall]').click();
      await p.waitForTimeout(300);
      await p.waitForFunction(
        () => !document.querySelector('canvas[data-engine]').dataset.destination,
        null,
        { timeout: 60000 },
      );
      for (let i = 0; i < 14; i++) {
        if (
          (await p.locator('.devotional-controls .devotional-action').first().isEnabled()) &&
          (await p.locator('.devotional-controls .devotional-action').first().isVisible())
        )
          break;
        await p.keyboard.down('w');
        await p.waitForTimeout(400);
        await p.keyboard.up('w');
        await p.waitForTimeout(80);
      }
      result.steps.push({
        name: 'approach',
        state: await p.locator('canvas[data-engine]').evaluate((e) => ({ ...e.dataset })),
      });
      await p.getByRole('button', { name: '향 올리기', exact: true }).click({ timeout: 10000 });
      await p.waitForTimeout(500);
      await p.screenshot({ path: fileURLToPath(new URL('queue.png', dir)) });
      await p.waitForFunction(
        () => document.querySelector('canvas[data-engine]').dataset.incenseOwn === 'true',
        null,
        { timeout: 90000 },
      );
      result.steps.push({
        name: 'offered',
        state: await p.locator('canvas[data-engine]').evaluate((e) => ({ ...e.dataset })),
      });
      await p.screenshot({ path: fileURLToPath(new URL('offered.png', dir)) });
      result.status = 'completed';
      console.log(side, 'offered');
    } catch (e) {
      result.status = 'failed';
      result.error = e.message;
      result.text = await p
        .locator('body')
        .innerText()
        .catch(() => null);
      await p.screenshot({ path: fileURLToPath(new URL('failure.png', dir)) }).catch(() => {});
      console.log(side, e.message);
    }
    await writeFile(new URL('results.json', dir), JSON.stringify(result, null, 2));
    await ctx.close();
    await p.video().saveAs(fileURLToPath(new URL('ritual.webm', dir)));
  }
} finally {
  await browser.close();
}
