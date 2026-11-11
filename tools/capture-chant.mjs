import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const results = [];
try {
  for (const side of ['source', 'local']) {
    const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191',
      ctx = await browser.newContext({
        viewport: { width: 960, height: 451 },
        serviceWorkers: 'block',
      }),
      p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(() => {
      window.__media = [];
      const create = document.createElement;
      document.createElement = function (tag, ...args) {
        const e = create.call(this, tag, ...args);
        if (tag.toLowerCase() === 'audio') window.__media.push(e);
        return e;
      };
    });
    await p.goto(base + '/?room=maru-20');
    await p.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
    await p.waitForFunction(() => document.querySelector('canvas[data-engine]')?.dataset.position);
    await p.locator('#chant-invite').click();
    await p.waitForFunction(
      () =>
        window.__media.some(
          (e) => e.src.includes('temple-chant') && !e.paused && e.currentTime > 0.5,
        ),
      null,
      { timeout: 20000 },
    );
    const playing = await p.evaluate(() =>
      window.__media.map((e) => ({
        src: e.src,
        currentTime: e.currentTime,
        duration: e.duration,
        paused: e.paused,
      })),
    );
    await p.locator('#game-settings').click();
    await p.locator('#chant-personal').click();
    await p.waitForFunction(() =>
      window.__media.filter((e) => e.src.includes('temple-chant')).every((e) => e.paused),
    );
    results.push({ side, playing, stopped: true, errors });
    await ctx.close();
    console.log(side, 'chant playback and stop passed');
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('../RECON/mirror/comparisons/chant.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
}
