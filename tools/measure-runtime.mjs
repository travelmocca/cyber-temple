import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const samples = [],
  recovery = [];
try {
  for (const side of ['source', 'local'])
    for (let run = 1; run <= 3; run++) {
      const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191',
        ctx = await browser.newContext({
          viewport: { width: 960, height: 451 },
          deviceScaleFactor: 1,
          serviceWorkers: 'block',
        }),
        p = await ctx.newPage();
      let abortOne = run === 1;
      if (abortOne) {
        await ctx.route('**/assets/game-U0Pmc8tU.js', (route) => {
          if (abortOne) {
            route.abort();
          } else route.continue();
        });
        await p.goto(base);
        await p.locator('#sansa-boot.is-error').waitFor({ state: 'visible' });
        recovery.push({ side, message: await p.locator('#sansa-boot').innerText() });
        abortOne = false;
      }
      const start = Date.now();
      await p.goto(base + '/?room=maru-20');
      await p.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
      await p.waitForFunction(
        () => document.querySelector('canvas[data-engine]')?.dataset.position,
      );
      const loadedMs = Date.now() - start;
      await p.waitForTimeout(4000);
      const data = await p
        .locator('canvas[data-engine]')
        .evaluate((e) =>
          Object.fromEntries(
            [
              'fps',
              'frameMedianMs',
              'frameP95Ms',
              'frameWorstMs',
              'remoteCount',
              'drawCalls',
              'triangles',
              'readyMs',
              'position',
              'light',
              'pixelRatio',
            ].map((k) => [k, e.dataset[k]]),
          ),
        );
      samples.push({ side, run, loadedMs, ...data });
      console.log(side, run, loadedMs, data.fps);
      await ctx.close();
      await writeFile(
        new URL('../RECON/mirror/comparisons/performance.json', import.meta.url),
        JSON.stringify(
          {
            browser: browser.version(),
            viewport: { width: 960, height: 451 },
            dpr: 1,
            note: 'Source has uncontrolled public visitors; samples are descriptive, not an equal-crowd performance-equivalence claim',
            samples,
            recovery,
          },
          null,
          2,
        ),
      );
    }
} finally {
  await browser.close();
}
