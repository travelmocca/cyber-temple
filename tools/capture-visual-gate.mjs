import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../RECON/mirror/comparisons/gate/', import.meta.url);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
try {
  for (const side of ['source', 'local']) {
    const dir = new URL(side + '/', root);
    await mkdir(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 902 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      recordVideo: { dir: fileURLToPath(dir), size: { width: 960, height: 451 } },
    });
    await ctx.addInitScript(() => {
      const p = WebGL2RenderingContext.prototype,
        locations = new WeakSet(),
        get = p.getUniformLocation,
        set = p.uniform3f;
      p.getUniformLocation = function (program, name) {
        const loc = get.call(this, program, name);
        if (name === 'cameraPosition' && loc) locations.add(loc);
        return loc;
      };
      p.uniform3f = function (loc, x, y, z) {
        if (locations.has(loc) && this.getParameter(this.FRAMEBUFFER_BINDING) === null)
          window.__observedCamera = { x, y, z };
        return set.call(this, loc, x, y, z);
      };
    });
    const page = await ctx.newPage(),
      samples = [],
      errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    const base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191';
    if (side === 'local')
      await ctx.route('**/*', (r) =>
        new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
      );
    const snapshot = async (name) => {
      await page.waitForTimeout(800);
      const data = await page.evaluate(() => ({
        canvas: { ...document.querySelector('canvas[data-engine]').dataset },
        camera: window.__observedCamera,
      }));
      samples.push({ name, ...data });
      await page.screenshot({ path: fileURLToPath(new URL(name + '.png', dir)) });
      console.log(side, name, data.canvas.position);
    };
    const travel = async (pin) => {
      await page.locator('#village-places').click({ noWaitAfter: true });
      await page.locator(`[data-place="${pin}"]`).click({ noWaitAfter: true });
      await page.waitForTimeout(500);
      await page.waitForFunction(
        () => !document.querySelector('canvas[data-engine]').dataset.destination,
        null,
        { timeout: 100000 },
      );
    };
    const drag = async (dx) => {
      await page.mouse.move(300, 450);
      await page.mouse.down();
      await page.mouse.move(300 + dx, 450, { steps: 40 });
      await page.mouse.up();
      await page.waitForTimeout(800);
    };
    const front = async () => {
      await page.waitForTimeout(900);
      const angle = await page.evaluate(() => {
        const pos = document
            .querySelector('canvas[data-engine]')
            .dataset.position.split(',')
            .map(Number),
          c = window.__observedCamera;
        return Math.atan2(c.x - pos[0], c.z - pos[1]);
      });
      if (Math.abs(angle) > 0.002) await drag(angle / 0.0034);
    };
    await page.goto(base + '/?room=maru-20');
    await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
    await page.waitForFunction(
      () =>
        window.__observedCamera && document.querySelector('canvas[data-engine]').dataset.position,
    );
    await travel('gate');
    await front();
    await snapshot('gate-front');
    await drag(Math.PI / 0.0034);
    await snapshot('orbit-half');
    await drag(Math.PI / 0.0034);
    await snapshot('orbit-full');
    await page.mouse.wheel(0, -450);
    await snapshot('avatar-close');
    await page.mouse.wheel(0, 450);
    await page.waitForTimeout(700);
    await travel('hall');
    await front();
    await snapshot('hall-entry');
    await travel('coffee-grove');
    await front();
    await snapshot('pond');
    await writeFile(
      new URL('samples.json', dir),
      JSON.stringify(
        {
          side,
          browser: browser.version(),
          viewport: { width: 1920, height: 902 },
          dpr: 1,
          samples,
          errors,
        },
        null,
        2,
      ),
    );
    await ctx.close();
    await page.video().saveAs(fileURLToPath(new URL('route-and-orbit.webm', dir)));
  }
} finally {
  await browser.close();
}
