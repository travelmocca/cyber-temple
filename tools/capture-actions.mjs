import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const side = process.env.SIDE ?? 'source',
  base = side === 'source' ? 'https://sansatemple.com' : 'http://127.0.0.1:4191';
const dir = new URL(`../RECON/mirror/comparisons/${side}-actions/`, import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
let result = { side, base, steps: [], errors: [], failures: [], frames: [] };
let livePage;
const clean = (x) =>
  Array.isArray(x)
    ? x.map(clean)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.entries(x).map(([k, v]) => [
            k,
            /token/i.test(k) ? 'REDACTED' : k === 'name' ? 'visitor' : clean(v),
          ]),
        )
      : x;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
    recordVideo: { dir: fileURLToPath(dir), size: { width: 960, height: 540 } },
  });
  const p = await context.newPage();
  livePage = p;
  p.setDefaultTimeout(25000);
  p.on('pageerror', (e) => result.errors.push(e.message));
  p.on('response', (r) => {
    if (r.status() >= 400)
      result.failures.push({ url: r.url().replace(/\?.*/, ''), status: r.status() });
  });
  p.on('websocket', (ws) => {
    for (const [event, direction] of [
      ['framesent', 'send'],
      ['framereceived', 'receive'],
    ])
      ws.on(event, ({ payload }) => {
        let data;
        try {
          data = clean(JSON.parse(payload.toString()));
        } catch {
          return;
        }
        if (
          !['snapshot', 'delta', 'ack', 'move', 'pong'].includes(data.type) &&
          result.frames.length < 1500
        )
          result.frames.push({ direction, data });
      });
  });
  const save = async (name) => {
    await p.waitForTimeout(500);
    result.steps.push({
      name,
      state: await p.locator('canvas[data-engine]').evaluate((e) => ({ ...e.dataset })),
      text: await p.locator('body').innerText(),
    });
    await p.screenshot({ path: fileURLToPath(new URL(name + '.png', dir)) });
    await writeFile(new URL('results.json', dir), JSON.stringify(result, null, 2));
    console.log(side, name);
  };
  const travel = async (id) => {
    await p.locator('#village-places').click({ noWaitAfter: true });
    await p.locator(`[data-place="${id}"]`).click({ noWaitAfter: true });
    await p.waitForTimeout(400);
    await p.waitForFunction(
      () => !document.querySelector('canvas[data-engine]').dataset.destination,
      null,
      { timeout: 100000 },
    );
  };
  await p.goto(base + '/?room=maru-20');
  await p.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
  await p.waitForFunction(() => document.querySelector('canvas[data-engine]')?.dataset.position);
  if (!process.env.ONLY_CAFE) {
    await p.locator('[data-mode=beads]').click({ noWaitAfter: true });
    await p.locator('.beads-stage canvas').waitFor({ state: 'visible' });
    await p.waitForTimeout(700);
    await p.locator('.beads-stage canvas').focus();
    await p.keyboard.press('ArrowDown');
    await p.waitForFunction(() => document.querySelector('.beads-count').textContent === '1');
    await save('beads');
    await p.locator('.beads-back').click({ noWaitAfter: true });
    await p.locator('#game-sound').click({ noWaitAfter: true });
    await p.locator('#game-moktak').click({ noWaitAfter: true });
    await p.locator('.moktak-instrument').waitFor({ state: 'visible' });
    await p.locator('.moktak-instrument').click({ noWaitAfter: true });
    await p.locator('.moktak-play').click({ noWaitAfter: true });
    await save('moktak');
    await p.locator('.moktak-play').click({ noWaitAfter: true });
    await p.locator('.moktak-close').click({ noWaitAfter: true });
    await p.locator('#game-settings').click({ noWaitAfter: true });
    await save('settings');
    await p.getByRole('button', { name: '설정 닫기', exact: true }).click({ noWaitAfter: true });
    await travel('hall');
    await p.locator('#hello').click({ noWaitAfter: true });
    await p.waitForTimeout(1000);
    await p.locator('#game-bow').click({ noWaitAfter: true });
    await p.waitForFunction(
      () => !!document.querySelector('canvas[data-engine]')?.dataset.cushion,
      null,
      { timeout: 40000 },
    );
    await p.waitForTimeout(5500);
    await save('bow');
    await p.locator('#game-bow').click({ noWaitAfter: true });
  }
  await travel('cafe');
  await p.getByRole('button', { name: '커피 내리기', exact: true }).click({ noWaitAfter: true });
  await p.locator('button[aria-label="커피 내리기"]').waitFor({ state: 'visible' });
  await p.locator('button[aria-label="커피 내리기"]').click({ noWaitAfter: true });
  await p.waitForFunction(
    () => document.querySelector('canvas[data-engine]').dataset.coffeeHeld === 'true',
    null,
    { timeout: 20000 },
  );
  await save('coffee');
  await p.locator('#game-support').click({ noWaitAfter: true });
  await save('support-entry');
  await p.keyboard.press('Escape');
  await context.close();
  await p.video().saveAs(fileURLToPath(new URL('actions.webm', dir)));
  result.status = 'completed';
} catch (e) {
  result.status = 'failed';
  result.error = e.message;
  if (livePage) {
    result.failureState = await livePage
      .evaluate(() => ({
        text: document.body.innerText,
        canvas: { ...document.querySelector('canvas[data-engine]')?.dataset },
      }))
      .catch(() => null);
    await livePage.screenshot({ path: fileURLToPath(new URL('failure.png', dir)) }).catch(() => {});
  }
  console.error(e.message);
} finally {
  await browser.close();
  await writeFile(new URL('results.json', dir), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      side,
      status: result.status,
      steps: result.steps.length,
      errors: result.errors,
      failures: result.failures,
    }),
  );
}
