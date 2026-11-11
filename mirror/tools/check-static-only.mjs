import { chromium } from 'playwright-core';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createMirrorServer } from '../server/index.mjs';
const app = createMirrorServer({ staticOnly: true });
app.server.listen(0, '127.0.0.1');
await once(app.server, 'listening');
const base = 'http://127.0.0.1:' + app.server.address().port,
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 451 } }),
    errors = [],
    requests = [],
    failures = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('websocket', (ws) => requests.push(new URL(ws.url()).pathname));
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() });
  });
  await page.goto(base + '/?room=maru-16');
  await page.waitForTimeout(7000);
  const result = {
    stage:
      'late static-only verification; full service was implemented before this isolated smoke test',
    staticOnly: true,
    webSockets: requests,
    errors,
    staticFailures: failures,
    text: await page.locator('body').innerText(),
  };
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  assert.ok(requests.includes('/presence/village'));
  await writeFile(
    new URL('../../RECON/mirror/network/static-only.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log({
    staticFailures: failures.length,
    scriptErrors: errors.length,
    requiredSocket: '/presence/village',
  });
} finally {
  await browser.close();
  await app.close();
}
