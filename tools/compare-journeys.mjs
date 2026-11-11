import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../RECON/mirror/comparisons/', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const pins = [
  'gate',
  'cafe',
  'hall',
  'north',
  'coffee-grove',
  'river',
  'bamboo',
  'persimmons',
  'bell',
  'pagoda',
  'lantern',
  'construction-work',
];
const records = [];
try {
  for (const side of ['source', 'local']) {
    const dir = new URL(side + '-complete/', root);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 902 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      recordVideo: { dir: fileURLToPath(dir), size: { width: 960, height: 451 } },
    });
    const page = await context.newPage();
    const errors = [],
      failures = [],
      externals = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400)
        failures.push({ url: r.url().replace(/\?.*/, ''), status: r.status() });
    });
    const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191';
    if (side === 'local') {
      await context.route('**/*', (r) =>
        new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
      );
      page.on('request', (r) => {
        if (!r.url().startsWith(base + '/')) externals.push(r.url());
      });
    }
    await page.goto(base + '/?room=maru-20');
    await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
    for (const pin of pins) {
      const result = { side, pin, startedAt: new Date().toISOString() };
      try {
        await page.getByRole('button', { name: '산사 둘러보기', exact: true }).click();
        await page.locator(`[data-place="${pin}"]`).click();
        await page.waitForTimeout(500);
        await page.waitForFunction(
          () => !document.querySelector('canvas[data-engine]')?.dataset.destination,
          null,
          { timeout: 90000 },
        );
        await page.waitForTimeout(700);
        result.state = await page
          .locator('canvas[data-engine]')
          .evaluate((e) => ({ ...e.dataset }));
        await page.screenshot({ path: fileURLToPath(new URL(pin + '.png', dir)) });
        result.status = 'arrived';
        if (pin === 'hall') {
          await page.getByRole('button', { name: '합장 인사', exact: true }).click();
          await page.waitForTimeout(900);
          await page.getByRole('button', { name: '절하기', exact: true }).click();
          await page.waitForTimeout(5200);
          await page
            .locator('#game-bow')
            .click()
            .catch(() => {});
        }
      } catch (e) {
        result.status = 'failed';
        result.error = e.message;
        await page.keyboard.press('Escape');
      }
      records.push(result);
      console.log(side, pin, result.status, result.state?.position);
      await writeFile(new URL('journeys.json', root), JSON.stringify(records, null, 2));
    }
    await writeFile(
      new URL('runtime.json', dir),
      JSON.stringify(
        {
          browser: browser.version(),
          viewport: { width: 1920, height: 902 },
          dpr: 1,
          errors,
          failures,
          externals,
        },
        null,
        2,
      ),
    );
    await context.close();
    await page.video().saveAs(fileURLToPath(new URL('journey.webm', dir)));
  }
} finally {
  await browser.close();
}
