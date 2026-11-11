import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out = new URL('../../RECON/mirror/', import.meta.url);
const site = new URL('../baseline/site/', import.meta.url);
const records = new Map(),
  jobs = [],
  frames = [],
  steps = [];
const frozen = await readFile(new URL('../baseline/manifest.json', import.meta.url), 'utf8')
  .then(JSON.parse)
  .catch(() => null);
if (frozen?.completedAt)
  throw Error('Frozen baseline exists. Use a separate directory for a new source version.');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const safeURL = (value) => {
  const u = new URL(value);
  for (const k of [...u.searchParams.keys()])
    if (/visit|token|key|session/i.test(k)) u.searchParams.set(k, 'REDACTED');
  return u.href;
};
const redact = (value) =>
  Array.isArray(value)
    ? value.map(redact)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value).map(([k, v]) => [
            k,
            /token|cookie|authorization/i.test(k)
              ? 'REDACTED'
              : k === 'name'
                ? 'visitor'
                : redact(v),
          ]),
        )
      : value;
await mkdir(out, { recursive: true });
await mkdir(new URL('network/', out), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 902 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  recordVideo: {
    dir: fileURLToPath(new URL('comparisons/source-video/', out)),
    size: { width: 960, height: 451 },
  },
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (res) => {
  if (new URL(res.url()).origin !== 'https://sansatemple.com') return;
  const job = (async () => {
    const u = new URL(res.url());
    if (
      !/\.(?:js|css|jpg|jpeg|png|webp|svg|ico|woff2?|ttf|mp3|wav|ogg|glb|bin|wasm|webmanifest|txt)$/.test(
        u.pathname,
      ) &&
      u.pathname !== '/'
    )
      return;
    const body = await res.body();
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    await mkdir(new URL(rel.replace(/[^/]+$/, ''), site), { recursive: true });
    await writeFile(new URL(rel, site), body);
    records.set(u.pathname, {
      url: safeURL(res.url()),
      finalURL: safeURL(res.url()),
      path: rel,
      status: res.status(),
      contentType: res.headers()['content-type'],
      bytes: body.length,
      sha256: sha(body),
      capturedAt: new Date().toISOString(),
      discovery: 'network-observed',
      headers: Object.fromEntries(
        Object.entries(res.headers()).filter(([k]) =>
          ['etag', 'last-modified', 'content-encoding', 'cache-control'].includes(k),
        ),
      ),
    });
  })();
  jobs.push(job.catch((e) => errors.push('capture: ' + e.message)));
});
page.on('websocket', (ws) => {
  const url = safeURL(ws.url());
  for (const [event, direction] of [
    ['framesent', 'send'],
    ['framereceived', 'receive'],
  ])
    ws.on(event, ({ payload }) => {
      let data;
      try {
        data = redact(JSON.parse(String(payload)));
      } catch {
        data = { binary: true, bytes: payload.length };
      }
      if (frames.length < 8000) frames.push({ at: new Date().toISOString(), url, direction, data });
    });
});
try {
  await page.goto('https://sansatemple.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: fileURLToPath(new URL('comparisons/source-entry.png', out)) });
  await writeFile(
    new URL('network/source-initial-ui.json', out),
    JSON.stringify(
      await page.evaluate(() => ({
        text: document.body.innerText,
        buttons: [...document.querySelectorAll('button')].map((e) => ({
          id: e.id,
          text: e.innerText,
          label: e.getAttribute('aria-label'),
          disabled: e.disabled,
        })),
        canvas: [...document.querySelectorAll('canvas')].map((e) => ({ ...e.dataset })),
        htmlDataset: { ...document.documentElement.dataset },
        ua: navigator.userAgent,
      })),
      null,
      2,
    ),
  );
  await page.getByRole('button', { name: '산사 둘러보기' }).click();
  const pins = await page.locator('[data-place]').evaluateAll((es) =>
    es.map((e) => ({
      id: e.dataset.place,
      label: e.getAttribute('aria-label'),
      text: e.innerText,
    })),
  );
  await writeFile(new URL('network/source-map-pins.json', out), JSON.stringify(pins, null, 2));
  await page.keyboard.press('Escape');
  for (const pin of pins) {
    try {
      await page.getByRole('button', { name: '산사 둘러보기' }).click();
      await page.locator(`[data-place="${pin.id}"]`).click();
      await page.waitForTimeout(10500);
      const state = await page.evaluate(() => ({
        text: document.body.innerText,
        canvas: [...document.querySelectorAll('canvas[data-engine]')].map((e) => ({
          ...e.dataset,
        })),
      }));
      await page.screenshot({
        path: fileURLToPath(new URL(`comparisons/source-${pin.id}.png`, out)),
      });
      steps.push({ id: pin.id, label: pin.label, state, status: 'observed' });
      console.log('source place', pin.id);
    } catch (e) {
      steps.push({ id: pin.id, status: 'failed', error: e.message });
      await page.keyboard.press('Escape');
    }
    await writeFile(new URL('network/source-journeys.json', out), JSON.stringify(steps, null, 2));
  }
} catch (e) {
  errors.push(e.stack);
  console.error(e.message);
} finally {
  await context.close();
  await Promise.allSettled(jobs);
  await browser.close();
  await writeFile(
    new URL('../baseline/manifest.json', import.meta.url),
    JSON.stringify(
      { hashBasis: 'decoded HTTP response bytes', files: [...records.values()] },
      null,
      2,
    ),
  );
  await writeFile(new URL('network/source-ws.json', out), JSON.stringify(frames, null, 2));
  await writeFile(new URL('network/source-errors.json', out), JSON.stringify(errors, null, 2));
  console.log(
    JSON.stringify({
      files: records.size,
      frames: frames.length,
      steps: steps.length,
      errors: errors.length,
    }),
  );
}
