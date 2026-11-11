import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 902 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [],
    failures = [],
    external = [],
    messages = [];
  await context.route('**/*', (r) =>
    new URL(r.request().url()).origin === 'http://127.0.0.1:4191' ? r.continue() : r.abort(),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failures.push({ url: r.url(), error: r.failure() }));
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() });
  });
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4191/')) external.push(r.url());
  });
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      try {
        const m = JSON.parse(f.payload.toString());
        messages.push({ type: m.type, code: m.code, count: m.visitors?.length });
      } catch {}
    });
  });
  await page.goto(process.env.PROBE_URL ?? 'http://127.0.0.1:4191/');
  await page.locator('#game-loading.is-loaded').waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: fileURLToPath(new URL('../RECON/mirror/comparisons/local-entry.png', import.meta.url)),
  });
  const state = await page.evaluate(() => ({
    text: document.body.innerText,
    canvas: [...document.querySelectorAll('canvas[data-engine]')].map((e) => ({ ...e.dataset })),
    buttons: [...document.querySelectorAll('button')]
      .filter((e) => e.getClientRects().length)
      .map((e) => ({
        id: e.id,
        text: e.innerText,
        label: e.getAttribute('aria-label'),
        disabled: e.disabled,
      })),
  }));
  await writeFile(
    new URL('../RECON/mirror/network/local-probe.json', import.meta.url),
    JSON.stringify({ state, errors, failures, external, messages: messages.slice(0, 20) }, null, 2),
  );
  console.log(
    JSON.stringify({
      state: state.text,
      errors,
      failures,
      external,
      messages: messages.slice(0, 5),
    }),
  );
} finally {
  await browser.close();
}
