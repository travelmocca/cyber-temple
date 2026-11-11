import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
try {
  await Promise.all(
    (process.env.SIDE ? [process.env.SIDE] : ['source', 'local']).map(async (side) => {
      const dir = new URL(`../../RECON/mirror/comparisons/${side}-self-coffee/`, import.meta.url);
      await mkdir(dir, { recursive: true });
      const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191',
        ctx = await browser.newContext({
          viewport: { width: 960, height: 540 },
          serviceWorkers: 'block',
          recordVideo: { dir: fileURLToPath(dir), size: { width: 960, height: 540 } },
        }),
        p = await ctx.newPage();
      p.setDefaultTimeout(20000);
      const result = { side, steps: [], errors: [] };
      p.on('pageerror', (e) => result.errors.push(e.message));
      const save = async (name) => {
        result.steps.push({
          name,
          state: await p.locator('canvas[data-engine]').evaluate((e) => ({ ...e.dataset })),
        });
        await p.screenshot({ path: fileURLToPath(new URL(name + '.png', dir)) });
        console.log(side, name);
        await writeFile(new URL('results.json', dir), JSON.stringify(result, null, 2));
      };
      const travel = async (pin, target) => {
        await p.locator('#village-places').click();
        await p.locator(`[data-place="${pin}"]`).click();
        await p.waitForFunction(
          (t) => {
            const c = document.querySelector('canvas[data-engine]'),
              pos = c.dataset.position?.split(',').map(Number);
            return pos && Math.hypot(pos[0] - t[0], pos[1] - t[1]) < 0.3 && !c.dataset.destination;
          },
          target,
          { timeout: 100000 },
        );
      };
      try {
        await p.goto(base + '/?room=maru-18');
        await p.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
        await p.waitForFunction(
          () => document.querySelector('canvas[data-engine]')?.dataset.position,
        );
        await travel('hall', [0, 22.535]);
        await p.locator('#game-bow').click();
        await p.waitForFunction(
          () => Number(document.querySelector('canvas[data-engine]').dataset.coffeeBows) >= 25,
          null,
          { timeout: 240000 },
        );
        await save('25-bows');
        await p.keyboard.down('w');
        await p.waitForTimeout(250);
        await p.keyboard.up('w');
        await p.waitForFunction(
          () => document.querySelector('canvas[data-engine]').dataset.mode === 'walk',
        );
        await travel('cafe', [14.4, 32.6]);
        await p.getByRole('button', { name: '커피 내리기', exact: true }).click();
        await p.getByRole('button', { name: /풀소유/ }).click();
        await p.locator('button[aria-label^="커피 내리기"]').click();
        await p.waitForFunction(
          () => document.querySelector('canvas[data-engine]').dataset.coffeeHeld === 'true',
          null,
          { timeout: 20000 },
        );
        await save('self-cup');
        for (let i = 1; i <= 3; i++) {
          await p.getByRole('button', { name: '한 모금 마시기', exact: true }).click();
          await p.waitForTimeout(2000);
          await save('sip-' + i);
        }
        if ((await p.locator('canvas[data-engine]').getAttribute('data-coffee-stage')) !== 'empty')
          throw Error('Cup did not become empty');
        result.status = 'passed';
      } catch (e) {
        result.status = 'failed';
        result.error = e.message;
        result.text = await p
          .locator('body')
          .innerText()
          .catch(() => null);
        await p.screenshot({ path: fileURLToPath(new URL('failure.png', dir)) }).catch(() => {});
        console.log(side, e.message);
      } finally {
        await writeFile(new URL('results.json', dir), JSON.stringify(result, null, 2));
        await ctx.close();
        await p.video().saveAs(fileURLToPath(new URL('self-coffee.webm', dir)));
      }
    }),
  );
} finally {
  await browser.close();
}
