import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../../RECON/mirror/comparisons/roundtrips/', import.meta.url);
await mkdir(root, { recursive: true });
const targets = {
  gate: [0, 48],
  cafe: [14.4, 32.6],
  hall: [0, 22.535],
  north: [-15, -52],
  'coffee-grove': [29.65, 2.5],
  river: [51.56, 25],
  bamboo: [-35.5, -8.4],
  persimmons: [16.5, 16.75],
  bell: [-24.3, 36.75],
  pagoda: [-17.3, 35.5],
  lantern: [-3, -22.4],
  'construction-work': [-6.8, 2.05],
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const sessions = [];
try {
  for (const side of ['source', 'local']) {
    const dir = new URL(side + '/', root);
    await mkdir(dir, { recursive: true });
    const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191',
      context = await browser.newContext({
        viewport: { width: 960, height: 451 },
        serviceWorkers: 'block',
        recordVideo: { dir: fileURLToPath(dir), size: { width: 960, height: 450 } },
      }),
      page = await context.newPage(),
      records = [],
      errors = [],
      failures = [],
      external = [];
    page.setDefaultTimeout(15000);
    if (side === 'local') {
      await context.route('**/*', (r) =>
        new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
      );
      await context.routeWebSocket('**', (r) => {
        if (r.url().startsWith(base.replace('http:', 'ws:') + '/')) r.connectToServer();
        else {
          external.push(r.url());
          r.close();
        }
      });
    }
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400)
        failures.push({ url: r.url().replace(/\?.*/, ''), status: r.status() });
    });
    page.on('request', (r) => {
      if (side === 'local' && !r.url().startsWith(base + '/')) external.push(r.url());
    });
    await page.goto(base + '/?room=maru-19');
    await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
    await page.waitForFunction(
      () => document.querySelector('canvas[data-engine]')?.dataset.position,
    );
    sessions.push({ side, dir, context, page, records, errors, failures, external });
  }
  async function go(s, pin, stage) {
    const { page, dir, side } = s,
      result = { pin, stage, startedAt: new Date().toISOString(), attempts: [] };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.locator('#village-places').click();
        await page.locator(`[data-place="${pin}"]`).click();
        await page.waitForFunction(
          ({ point, pin }) => {
            const c = document.querySelector('canvas[data-engine]'),
              p = c?.dataset.position?.split(',').map(Number);
            return (
              p && Math.hypot(p[0] - point[0], p[1] - point[1]) < (pin === 'pagoda' ? 2 : 0.32)
            );
          },
          { point: targets[pin], pin },
          { timeout: 100000 },
        );
        await page.waitForTimeout(350);
        result.position = await page.locator('canvas[data-engine]').getAttribute('data-position');
        result.attempts.push({ attempt, status: 'arrived' });
        result.status = 'passed';
        await page.screenshot({
          path: fileURLToPath(new URL(`${s.records.length}-${pin}-${stage}.png`, dir)),
        });
        break;
      } catch (e) {
        result.attempts.push({ attempt, status: 'failed', error: e.message });
        await page.keyboard.press('Escape');
      }
    }
    result.status ??= 'failed';
    s.records.push(result);
    await writeFile(
      new URL('results.json', dir),
      JSON.stringify(
        {
          side,
          viewport: { width: 960, height: 451 },
          browser: browser.version(),
          records: s.records,
          errors: s.errors,
          failures: s.failures,
          external: s.external,
        },
        null,
        2,
      ),
    );
    console.log(side, pin, stage, result.status, result.position);
  }
  for (const pin of Object.keys(targets)) {
    await Promise.all(sessions.map((s) => go(s, pin, 'arrive')));
    if (pin !== 'gate') await Promise.all(sessions.map((s) => go(s, 'gate', 'return-from-' + pin)));
  }
  for (const s of sessions) {
    await s.context.close();
    await s.page.video().saveAs(fileURLToPath(new URL('roundtrips.webm', s.dir)));
  }
} finally {
  await browser.close();
}
