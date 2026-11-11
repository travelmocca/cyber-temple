import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createMirrorServer } from '../../server/index.mjs';
let app, browser, base;
const out = new URL('../../test-results/entry/', import.meta.url);
before(async () => {
  await mkdir(out, { recursive: true });
  app = createMirrorServer();
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  base = 'http://127.0.0.1:' + app.server.address().port;
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
});
after(async () => {
  await browser?.close();
  await app?.close();
});

test(
  'desktop and mobile select eight wishes, refresh without repeats, inspect sources and recover catalog',
  { timeout: 90000 },
  async () => {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let block = true;
      await context.route('**/*', (r) => {
        if (block && r.request().url().endsWith('/temple-entry/catalog.json')) return r.abort();
        return new URL(r.request().url()).origin === base ? r.continue() : r.abort();
      });
      try {
        await page.goto(base + '/?room=maru-17');
        assert.equal(
          await page.locator('#temple-entry').evaluate((node) => getComputedStyle(node).position),
          'fixed',
        );
        const background = await page
          .locator('#temple-entry')
          .evaluate((node) => getComputedStyle(node, '::before').backgroundImage);
        assert.match(
          background,
          mobile ? /gate-mobile\.[a-f0-9]+\.webp/ : /gate-desktop\.[a-f0-9]+\.webp/,
        );
        await page.getByRole('button', { name: '重新加载', exact: true }).waitFor();
        block = false;
        await page.getByRole('button', { name: '重新加载', exact: true }).click();
        for (const label of ['求财', '事业', '姻缘', '健康', '学业', '家庭', '转运', '心安']) {
          await page.getByRole('button', { name: label, exact: true }).click();
          assert.equal(await page.locator('.entry-card').count(), 5);
        }
        await page.getByRole('button', { name: '姻缘', exact: true }).click();
        const before = await page
          .locator('.entry-card')
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.templeId));
        await page.locator('#entry-refresh').click();
        const next = await page
          .locator('.entry-card')
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.templeId));
        assert.equal(new Set([...before, ...next]).size, 10);
        await page.getByRole('button', { name: '健康', exact: true }).click();
        await page.getByRole('button', { name: '姻缘', exact: true }).click();
        assert.deepEqual(
          await page
            .locator('.entry-card')
            .evaluateAll((nodes) => nodes.map((n) => n.dataset.templeId)),
          next,
        );
        await page.locator('.entry-more').first().click();
        await page.locator('.entry-detail:not([hidden])').waitFor();
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.ok((await page.locator('.entry-sources a').count()) > 0);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.entry-card').first().isVisible(), true);
        await page.reload();
        await page.locator('.entry-card').first().waitFor();
        assert.deepEqual(
          await page
            .locator('.entry-card')
            .evaluateAll((nodes) => nodes.map((n) => n.dataset.templeId)),
          next,
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.equal(await page.locator('canvas[data-engine]').count(), 0);
        await page.locator('#entry-back-wishes').click();
        assert.equal(await page.locator('#temple-entry').getAttribute('data-step'), 'wishes');
        await page.getByRole('button', { name: '姻缘', exact: true }).click();
        assert.deepEqual(
          await page
            .locator('.entry-card')
            .evaluateAll((nodes) => nodes.map((n) => n.dataset.templeId)),
          next,
        );
        if (mobile) {
          const carousel = page.locator('.entry-cards');
          assert.ok(await carousel.evaluate((node) => node.scrollWidth > node.clientWidth));
          await carousel.evaluate((node) => node.scrollTo({ left: node.scrollWidth }));
          await page.locator('.entry-more').last().click();
          await page.getByRole('button', { name: '返回推荐寺院', exact: true }).click();
          await carousel.evaluate((node) => node.scrollTo({ left: 0 }));
        }
        await page.screenshot({
          path: fileURLToPath(new URL(mobile ? 'mobile.png' : 'desktop.png', out)),
          fullPage: true,
        });
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  },
);

test(
  'WebGL initialization failure exposes the floating retry without waiting for a timeout',
  { timeout: 30000 },
  async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await context.route('**/*', (r) =>
        new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
      );
      await context.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (/webgl/i.test(type)) return null;
          return getContext.call(this, type, ...args);
        };
      });
      const page = await context.newPage();
      await page.goto(base);
      await page.getByRole('button', { name: '心安', exact: true }).click();
      await page.locator('.entry-card .entry-enter').first().click();
      await page.locator('.entry-loading .entry-retry').waitFor({ timeout: 15000 });
      assert.equal(await page.locator('.entry-loading').getAttribute('data-state'), 'error');
      assert.equal(await page.locator('#app').evaluate((node) => node.inert), true);
      assert.equal(await page.locator('#temple-entry').isVisible(), true);
    } finally {
      await context.close();
    }
  },
);

test(
  'selected temple draws on the gate and admits visitors into the original shared room',
  { timeout: 140000 },
  async () => {
    const visitors = [];
    try {
      for (const category of ['求财', '姻缘']) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          serviceWorkers: 'block',
        });
        visitors.push(context);
        await context.route('**/*', (r) =>
          new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
        );
        await context.routeWebSocket('**', (r) =>
          r.url().startsWith(base.replace('http:', 'ws:') + '/') ? r.connectToServer() : r.close(),
        );
        await context.addInitScript(() => {
          const schedule = window.setTimeout;
          window.setTimeout = function (callback, delay, ...args) {
            // Extend the entrance fade to make input isolation observable without racing 240ms.
            const entranceFade =
              delay === 240 && new Error().stack.includes('/temple-entry/entry.mjs');
            return schedule.call(this, callback, entranceFade ? 1800 : delay, ...args);
          };
          window.drawnLabels = [];
          const draw = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
            window.drawnLabels.push(text);
            return draw.call(this, text, ...args);
          };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '/?room=maru-17');
        await page.getByRole('button', { name: category, exact: true }).click();
        await page.locator('.entry-card .entry-enter').first().click();
        await page.locator('.entry-loading').waitFor({ state: 'visible' });
        await page
          .locator('#game-loading.is-loaded')
          .waitFor({ state: 'attached', timeout: 80000 });
        await page.waitForFunction(
          () => document.querySelector('canvas[data-engine]')?.dataset.position,
          null,
          { timeout: 40000 },
        );
        const identity = await page.evaluate(() => ({
          selected: window.__templeEntry,
          drawn: window.drawnLabels,
        }));
        assert.ok(identity.drawn.includes(identity.selected.plaqueName));
        await page.locator('#temple-entry.is-revealing').waitFor();
        const position = await page.locator('canvas[data-engine]').getAttribute('data-position');
        await page.keyboard.down('w');
        await page.waitForTimeout(350);
        await page.keyboard.up('w');
        await page.keyboard.press('Digit2');
        assert.equal(
          await page.locator('canvas[data-engine]').getAttribute('data-position'),
          position,
        );
        assert.notEqual(
          await page.locator('canvas[data-engine]').getAttribute('data-mode'),
          'beads',
        );
        assert.equal(await page.locator('#temple-entry').isVisible(), true);
        await page.locator('#temple-entry').waitFor({ state: 'hidden' });
        assert.equal((await page.locator('#game-room-number').innerText()).trim(), '17');
        await page.locator('#game-settings').click();
        await page.locator('#settings-dialog').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        assert.deepEqual(errors, []);
        await page.screenshot({
          path: fileURLToPath(
            new URL(category === '求财' ? 'scene-wealth.png' : 'scene-love.png', out),
          ),
        });
      }
      const sessions = [...app.hub.sessions.values()];
      assert.equal(sessions.length, 2);
    } finally {
      for (const context of visitors) await context.close();
    }
  },
);

test(
  'warm entry reuses versioned game resources and never loads the extended font',
  { timeout: 70000 },
  async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const requests = [];
    context.on('request', (request) => requests.push(request.url()));
    try {
      const page = await context.newPage();
      for (const visit of ['cold', 'warm']) {
        await page.goto(base);
        await page.getByRole('button', { name: '心安', exact: true }).click();
        await page.locator('.entry-card .entry-enter').first().click();
        await page.locator('#temple-entry').waitFor({ state: 'hidden', timeout: 45000 });
        const game = await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .find((resource) => resource.name.includes('/assets/game-U0Pmc8tU.js'))
            ?.toJSON(),
        );
        assert.ok(game?.name.includes('?v='));
        if (visit === 'warm') assert.equal(game.transferSize, 0);
        assert.ok(
          await page.evaluate(() =>
            [...document.styleSheets].some((sheet) => sheet.href?.includes('game-CvBwdk0t.css?v=')),
          ),
        );
      }
      assert.equal(
        requests.some((url) => url.includes('SansaQuietUI-Remainder')),
        false,
      );
    } finally {
      await context.close();
    }
  },
);
