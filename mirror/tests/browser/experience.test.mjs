import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createMirrorServer } from '../../server/index.mjs';
let app, browser, base;
const out = process.env.MIRROR_E2E_OUTPUT
  ? new URL(
      process.env.MIRROR_E2E_OUTPUT.endsWith('/')
        ? process.env.MIRROR_E2E_OUTPUT
        : process.env.MIRROR_E2E_OUTPUT + '/',
      'file://' + process.cwd() + '/',
    )
  : new URL('../../../RECON/mirror/comparisons/regression/', import.meta.url);
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
async function open(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
    ...options,
  });
  const external = [],
    errors = [],
    failures = [],
    messages = [];
  await context.routeWebSocket('**', (route) => {
    if (route.url().startsWith(base.replace('http:', 'ws:') + '/')) route.connectToServer();
    else {
      external.push(route.url());
      route.close({ code: 1008, reason: 'External origin blocked' });
    }
  });
  await context.route('**/*', (r) =>
    new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  page.on('request', (r) => {
    if (!r.url().startsWith(base + '/')) external.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() });
  });
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      try {
        messages.push(JSON.parse(String(f.payload)));
      } catch {}
    }),
  );
  await page.goto(base + '/?room=maru-17');
  await ready(page);
  return { context, page, external, errors, failures, messages };
}
async function ready(page) {
  await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 80000 });
  await page.waitForFunction(
    () => document.querySelector('canvas[data-engine]')?.dataset.position,
    null,
    { timeout: 40000 },
  );
}
async function travel(page, pin) {
  await page.locator('#village-places').click({ noWaitAfter: true });
  await page.locator(`[data-place="${pin}"]`).click({ noWaitAfter: true });
  await page.waitForTimeout(300);
  const target = { cafe: [14.4, 32.6], hall: [0, 22.535], gate: [0, 48] }[pin];
  await page.waitForFunction(
    (target) => {
      const c = document.querySelector('canvas[data-engine]'),
        pos = c?.dataset.position?.split(',').map(Number);
      return (
        !!pos &&
        !c.dataset.destination &&
        (!target || Math.hypot(pos[0] - target[0], pos[1] - target[1]) < 0.3)
      );
    },
    target,
    { timeout: 100000 },
  );
}
async function state(page) {
  return page.locator('canvas[data-engine]').evaluate((e) => ({ ...e.dataset }));
}
async function record(name, value) {
  await writeFile(new URL(name + '.json', out), JSON.stringify(value, null, 2));
}
test(
  'Chinese desktop and touch UI localize menus, map labels, tooltips and dynamic counters',
  { timeout: 120000 },
  async () => {
    const results = [];
    for (const mobile of [false, true]) {
      const visitor = await open(
        mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {},
      );
      const page = visitor.page;
      const label = mobile ? 'mobile' : 'desktop';
      const assertTranslated = async () => {
        const content = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          text: document.body.innerText,
          labels: [...document.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap(
            (element) =>
              ['aria-label', 'title', 'placeholder'].map(
                (attribute) => element.getAttribute(attribute) ?? '',
              ),
          ),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        assert.equal(content.lang, 'zh-CN');
        assert.doesNotMatch(content.text + content.labels.join('\n'), /[\uac00-\ud7a3]/u);
        assert.equal(content.overflow, false);
        return content;
      };
      try {
        assert.equal(await page.locator('#game-bow').getAttribute('aria-label'), '礼佛');
        await assertTranslated();
        await page.screenshot({ path: fileURLToPath(new URL('zh-' + label + '-entry.png', out)) });
        await page.locator('#game-settings').click();
        await page.locator('#settings-dialog').waitFor({ state: 'visible' });
        await page.waitForFunction(
          () => getComputedStyle(document.querySelector('#settings-dialog')).opacity === '1',
        );
        assert.equal(await page.locator('#settings-title').innerText(), '设置');
        assert.match(await page.locator('#settings-dialog').innerText(), /韩国时间/);
        await assertTranslated();
        await page.screenshot({
          path: fileURLToPath(new URL('zh-' + label + '-settings.png', out)),
        });
        await page.getByRole('button', { name: '关闭设置', exact: true }).click();
        await page.locator('#village-places').click();
        await page.locator('#village-places-dialog').waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
          const dialog = document.querySelector('#village-places-dialog');
          const image = document.querySelector('#village-map-art');
          return (
            getComputedStyle(dialog).opacity === '1' && image.complete && image.naturalWidth > 0
          );
        });
        const places = await page
          .locator('[data-place]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
        assert.deepEqual(places, [
          '入口',
          '咖啡',
          '清缘堂',
          '林间小径',
          '池畔休憩处',
          '河畔步道',
          '竹林',
          '柿饼晾晒场',
          '梵钟',
          '绕塔',
          '施工现场',
          '搬运瓦片',
        ]);
        await assertTranslated();
        await page.screenshot({ path: fileURLToPath(new URL('zh-' + label + '-map.png', out)) });
        await page.getByRole('button', { name: '关闭地图', exact: true }).click();
        await page.locator('#game-room').click();
        assert.equal(await page.locator('#room-title').innerText(), '山寺房间');
        await page.locator('#game-people').click();
        await page.locator('#people-dialog').waitFor({ state: 'visible' });
        assert.match(await page.locator('#visitor-list').innerText(), /清静访客/);
        await assertTranslated();
        await page.getByRole('button', { name: '关闭访客窗口', exact: true }).click();
        if (await page.locator('#room-dialog').isVisible())
          await page.getByRole('button', { name: '关闭房间选择', exact: true }).click();
        await page.locator('[data-mode=beads]').click();
        await page.locator('.beads-stage canvas').waitFor({ state: 'visible' });
        await page.locator('.beads-stage canvas').focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(
          () => document.querySelector('.beads-count')?.textContent === '1',
        );
        assert.match(
          await page.locator('.beads-counter').getAttribute('aria-label'),
          /本圈 1颗，共 1颗/,
        );
        await assertTranslated();
        assert.deepEqual(visitor.errors, []);
        assert.deepEqual(visitor.external, []);
        results.push({
          mobileEmulation: mobile,
          places,
          translated: true,
          consoleErrors: visitor.errors,
        });
      } finally {
        await visitor.context.close();
      }
    }
    await record('zh-interface', results);
  },
);

test(
  'original UI completes beads, audio, tools, café, hall and revisit with original domains blocked',
  { timeout: 240000 },
  async () => {
    const v = await open();
    const p = v.page;
    try {
      await p.locator('[data-mode=beads]').click({ noWaitAfter: true });
      await p.locator('.beads-stage canvas').waitFor({ state: 'visible' });
      await p.waitForTimeout(700);
      await p.locator('.beads-stage canvas').focus();
      await p.keyboard.press('ArrowDown');
      await p.waitForFunction(() => document.querySelector('.beads-count')?.textContent === '1');
      await p.locator('.beads-back').click({ noWaitAfter: true });
      await p.locator('#game-sound').click({ noWaitAfter: true });
      await p.locator('#game-moktak').click({ noWaitAfter: true });
      await p.locator('.moktak-instrument').waitFor({ state: 'visible' });
      await p.locator('.moktak-instrument').click({ noWaitAfter: true });
      await p.locator('.moktak-play').click({ noWaitAfter: true });
      assert.equal(await p.locator('.moktak-play').getAttribute('aria-pressed'), 'true');
      await p.locator('.moktak-play').click({ noWaitAfter: true });
      await p.locator('.moktak-close').click({ noWaitAfter: true });
      await p.locator('#game-support').click({ noWaitAfter: true });
      const popupPromise = p.waitForEvent('popup');
      await p.locator('#support-coffee').click({ noWaitAfter: true });
      const popup = await popupPromise;
      await popup.waitForLoadState();
      assert.ok(popup.url().startsWith(base + '/__mirror/payment'));
      assert.match(await popup.locator('body').innerText(), /模拟供养/);
      await popup.close();
      await p.keyboard.press('Escape');
      await p.locator('#game-settings').click({ noWaitAfter: true });
      await p.locator('#settings-dialog').waitFor({ state: 'visible' });
      await p.getByRole('button', { name: '关闭设置', exact: true }).click({ noWaitAfter: true });
      await travel(p, 'hall');
      assert.equal((await state(p)).space, 'hall');
      await p.locator('#game-bow').click({ noWaitAfter: true });
      await p.waitForFunction(
        () => !!document.querySelector('canvas[data-engine]')?.dataset.cushion,
        null,
        { timeout: 30000 },
      );
      await p.waitForTimeout(5200);
      await p.locator('#game-bow').click({ noWaitAfter: true });
      await p.keyboard.down('w');
      await p.waitForTimeout(250);
      await p.keyboard.up('w');
      await p.waitForFunction(
        () =>
          document.querySelector('canvas[data-engine]').dataset.mode === 'walk' &&
          !document.querySelector('canvas[data-engine]').dataset.cushion,
      );
      await p.screenshot({ path: fileURLToPath(new URL('hall.png', out)) });
      await travel(p, 'cafe');
      await p.getByRole('button', { name: '制作咖啡', exact: true }).click({ noWaitAfter: true });
      await p.locator('button[aria-label="制作咖啡"]').waitFor({ state: 'visible' });
      await p.locator('button[aria-label="制作咖啡"]').click({ noWaitAfter: true });
      await p.waitForFunction(
        () => document.querySelector('canvas[data-engine]').dataset.coffeeHeld === 'true',
        null,
        { timeout: 15000 },
      );
      assert.equal((await state(p)).coffeePurpose, 'gift');
      const checkpoint = await state(p);
      await p.reload();
      await ready(p);
      await p.waitForFunction(
        () => document.querySelector('canvas[data-engine]').dataset.coffeeHeld === 'true',
      );
      await p.locator('[data-mode=beads]').click({ noWaitAfter: true });
      await p.locator('.beads-stage canvas').waitFor({ state: 'visible' });
      await p.waitForFunction(() => document.querySelector('.beads-count')?.textContent === '1');
      await p.locator('.beads-back').click({ noWaitAfter: true });
      await p.locator('#game-exit').click({ noWaitAfter: true });
      await p.locator('#temple-return').waitFor({ state: 'visible' });
      await p.locator('#temple-return').click({ noWaitAfter: true });
      await ready(p);
      assert.deepEqual(v.errors, []);
      assert.deepEqual(v.failures, []);
      assert.deepEqual(v.external, []);
      await record('native-journey', {
        checkpoint,
        errors: v.errors,
        failures: v.failures,
        external: v.external,
        browser: browser.version(),
      });
    } catch (e) {
      await record('failure-' + Date.now(), {
        error: e.message,
        state: await state(p).catch(() => null),
        text: await p
          .locator('body')
          .innerText()
          .catch(() => ''),
        messages: v.messages.filter((m) => ['cafe25-result', 'error'].includes(m.type)),
        errors: v.errors,
        failures: v.failures,
        external: v.external,
      });
      throw e;
    } finally {
      await v.context.close();
    }
  },
);
test(
  'two independent browsers see each other, change rooms and resume after actual connection loss',
  { timeout: 150000 },
  async () => {
    const a = await open(),
      b = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await a.page.waitForFunction(
        () => Number(document.querySelector('canvas[data-engine]')?.dataset.remoteCount) >= 5,
      );
      await b.page.waitForFunction(
        () => Number(document.querySelector('canvas[data-engine]')?.dataset.remoteCount) >= 5,
      );
      const self = a.messages.find((m) => m.type === 'snapshot').selfId;
      await a.page.locator('#hello').click({ noWaitAfter: true });
      for (
        let i = 0;
        i < 40 && !b.messages.some((m) => m.type === 'event' && m.event.id === self);
        i++
      )
        await b.page.waitForTimeout(100);
      assert.ok(b.messages.some((m) => m.type === 'event' && m.event.id === self));
      for (const ws of app.wss.clients) ws.terminate();
      for (
        let i = 0;
        i < 80 && !a.messages.some((m) => m.type === 'snapshot' && m.resumed === true);
        i++
      )
        await a.page.waitForTimeout(100);
      assert.ok(a.messages.some((m) => m.type === 'snapshot' && m.resumed && m.selfId === self));
      for (let i = 0; i < 80 && app.hub.directory().rooms[16].count !== 2; i++)
        await a.page.waitForTimeout(100);
      assert.equal(app.hub.directory().rooms[16].count, 2);
      await b.page.locator('#game-room').tap();
      await b.page.locator('#room-dialog .room-choice').nth(17).tap();
      for (let i = 0; i < 60 && app.hub.directory().rooms[16].count !== 1; i++)
        await b.page.waitForTimeout(100);
      assert.equal(app.hub.directory().rooms[16].count, 1);
      assert.equal(app.hub.directory().rooms[17].count, 1);
      await b.page.screenshot({ path: fileURLToPath(new URL('mobile-emulation.png', out)) });
      assert.deepEqual([...a.errors, ...b.errors], []);
      assert.deepEqual([...a.external, ...b.external], []);
      await record('two-visitors', {
        independentContexts: true,
        simulatedMobile: true,
        resumed: true,
        roomCounts: [1, 1],
        errors: [...a.errors, ...b.errors],
      });
    } finally {
      await a.context.close();
      await b.context.close();
    }
  },
);
test(
  'real pointer drags orbit 360 degrees and wheel zoom stays bounded',
  { timeout: 90000 },
  async () => {
    const v = await open();
    const p = v.page;
    try {
      await p.reload();
      await p.addInitScript(() => {});
      const session = await p.context().newCDPSession(p);
      // Observe actual rendered camera uniforms without changing the game or its input handlers.
      await p.addInitScript(() => {
        const proto = WebGL2RenderingContext.prototype,
          locations = new WeakSet(),
          get = proto.getUniformLocation,
          set = proto.uniform3f;
        proto.getUniformLocation = function (program, name) {
          const loc = get.call(this, program, name);
          if (name === 'cameraPosition' && loc) locations.add(loc);
          return loc;
        };
        proto.uniform3f = function (loc, x, y, z) {
          if (locations.has(loc) && this.getParameter(this.FRAMEBUFFER_BINDING) === null)
            window.renderCamera = { x, y, z };
          return set.call(this, loc, x, y, z);
        };
      });
      await p.reload();
      await ready(p);
      await p.waitForFunction(() => window.renderCamera?.z > 48);
      await p.waitForTimeout(600);
      const initial = await p.evaluate(() => window.renderCamera);
      const drag = async (dx) => {
        await p.mouse.move(150, 350);
        await p.mouse.down();
        await p.mouse.move(150 + dx, 350, { steps: 40 });
        await p.mouse.up();
        await p.waitForTimeout(700);
      };
      await drag(Math.PI / 0.0034);
      const half = await p.evaluate(() => window.renderCamera);
      assert.ok(half.z < 48, 'camera reaches rear hemisphere');
      await drag(Math.PI / 0.0034);
      const full = await p.evaluate(() => window.renderCamera);
      assert.ok(
        Math.hypot(full.x - initial.x, full.z - initial.z) < 0.8,
        'full revolution returns to initial camera position',
      );
      await p.mouse.wheel(0, -9000);
      await p.waitForTimeout(700);
      const near = await p.evaluate(() => window.renderCamera);
      await p.mouse.wheel(0, 18000);
      await p.waitForTimeout(700);
      const far = await p.evaluate(() => window.renderCamera);
      assert.ok(Math.hypot(far.x, far.z - 48) > Math.hypot(near.x, near.z - 48));
      assert.ok(Math.hypot(far.x, far.z - 48) < 16);
      await record('orbit', { initial, half, full, near, far, errors: v.errors });
      assert.deepEqual(v.errors, []);
      await session.detach();
    } finally {
      await v.context.close();
    }
  },
);
test(
  'failed dynamic module load shows retry and recovers in a clean context',
  { timeout: 70000 },
  async () => {
    const context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      serviceWorkers: 'block',
    });
    const p = await context.newPage();
    let failed = false,
      block = true;
    try {
      await context.route('**/*', (r) => {
        if (block && r.request().url().endsWith('/assets/game-U0Pmc8tU.js')) {
          failed = true;
          return r.abort('failed');
        }
        return new URL(r.request().url()).origin === base ? r.continue() : r.abort();
      });
      await p.goto(base);
      await p.locator('#sansa-boot.is-error').waitFor({ state: 'visible', timeout: 15000 });
      const before = await p.locator('#sansa-boot').innerText();
      block = false;
      await p.reload();
      await ready(p);
      await record('resource-recovery', {
        failedRequest: true,
        before,
        recovered: (await state(p)).position,
      });
    } finally {
      await context.close();
    }
  },
);
test(
  'mobile touch tap walks, drag orbits and two-finger pinch zooms',
  { timeout: 90000 },
  async () => {
    const v = await open({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const p = v.page;
    try {
      await p.addInitScript(() => {
        const proto = WebGL2RenderingContext.prototype,
          locations = new WeakSet(),
          get = proto.getUniformLocation,
          set = proto.uniform3f;
        proto.getUniformLocation = function (program, name) {
          const loc = get.call(this, program, name);
          if (name === 'cameraPosition' && loc) locations.add(loc);
          return loc;
        };
        proto.uniform3f = function (loc, x, y, z) {
          if (locations.has(loc) && this.getParameter(this.FRAMEBUFFER_BINDING) === null)
            window.renderCamera = { x, y, z };
          return set.call(this, loc, x, y, z);
        };
      });
      await p.reload();
      await ready(p);
      await p.waitForFunction(() => window.renderCamera);
      const initial = await state(p);
      await p.touchscreen.tap(195, 650);
      await p.waitForTimeout(1600);
      const walked = await state(p);
      assert.notEqual(walked.position, initial.position);
      const cdp = await p.context().newCDPSession(p);
      const camera = await p.evaluate(() => window.renderCamera);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 60, y: 420, id: 1 }],
      });
      for (let i = 1; i <= 20; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 60 + i * 12, y: 420, id: 1 }],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(700);
      const orbited = await p.evaluate(() => window.renderCamera);
      assert.ok(Math.hypot(orbited.x - camera.x, orbited.z - camera.z) > 1);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: 165, y: 420, id: 1 },
          { x: 225, y: 420, id: 2 },
        ],
      });
      for (let i = 1; i <= 12; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: 165 - i * 5, y: 420, id: 1 },
            { x: 225 + i * 5, y: 420, id: 2 },
          ],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(700);
      const pinched = await p.evaluate(() => window.renderCamera),
        [x, z] = (await state(p)).position.split(',').map(Number);
      assert.ok(
        Math.hypot(pinched.x - x, pinched.z - z) < Math.hypot(orbited.x - x, orbited.z - z),
      );
      await record('touch-input', {
        emulation: true,
        initial: initial.position,
        walked: walked.position,
        camera,
        orbited,
        pinched,
        errors: v.errors,
      });
      assert.deepEqual(v.errors, []);
      assert.deepEqual(v.external, []);
      await cdp.detach();
    } finally {
      await v.context.close();
    }
  },
);
test(
  'default URL without query parameters admits a clean visitor',
  { timeout: 90000 },
  async () => {
    const context = await browser.newContext({
        viewport: { width: 960, height: 451 },
        serviceWorkers: 'block',
      }),
      p = await context.newPage(),
      errors = [],
      external = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('request', (r) => {
      if (!r.url().startsWith(base + '/')) external.push(r.url());
    });
    try {
      await context.route('**/*', (r) =>
        new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
      );
      await context.routeWebSocket('**', (r) =>
        r.url().startsWith(base.replace('http:', 'ws:') + '/') ? r.connectToServer() : r.close(),
      );
      await p.goto(base);
      await ready(p);
      assert.equal((await p.locator('#game-room-number').innerText()).trim(), '01');
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      await record('default-entry', { url: p.url(), state: await state(p), errors, external });
      await p.screenshot({ path: fileURLToPath(new URL('default-entry.png', out)) });
    } finally {
      await context.close();
    }
  },
);
