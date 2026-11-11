// Run against the same machine/server with and without the optimization; no public traffic.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const base = process.env.PERF_URL ?? 'http://127.0.0.1:4193';
const output = resolve(process.env.PERF_OUTPUT ?? 'test-results/performance/entry.json');
const runs = Number(process.env.PERF_RUNS ?? 3);
const mobile = process.env.PERF_MOBILE === '1';
const entryOnly = process.env.PERF_ENTRY_ONLY === '1';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
const samples = [];
try {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => sessionStorage.removeItem('temple-entry-v1'));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 80,
      downloadThroughput: (10 * 1000 * 1000) / 8,
      uploadThroughput: (10 * 1000 * 1000) / 8,
      connectionType: 'cellular4g',
    });
    const requests = new Map();
    cdp.on('Network.responseReceived', ({ requestId, response, type }) => {
      if (response.url.startsWith(base + '/'))
        requests.set(requestId, { url: response.url, type, bytes: 0 });
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      if (requests.has(requestId)) requests.get(requestId).bytes = encodedDataLength;
    });
    const snapshot = () => {
      const resources = [...requests.values()].map((resource) => ({ ...resource }));
      return { networkBytes: resources.reduce((sum, r) => sum + r.bytes, 0), resources };
    };
    for (const visit of ['cold', 'warm']) {
      requests.clear();
      const start = performance.now();
      await page.goto(base + '/?room=maru-17');
      await page.getByRole('button', { name: '心安', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const entryMs = performance.now() - start;
      // Include late favicon requests in the entry byte count; they do not block usability.
      await page.waitForLoadState('networkidle', { timeout: 60000 });
      const entry = snapshot();
      if (entryOnly) {
        samples.push({ run, visit, entryMs, entry });
        console.log(JSON.stringify({ run, visit, entryMs, entryBytes: entry.networkBytes }));
        continue;
      }
      await page.getByRole('button', { name: '心安', exact: true }).click();
      const entering = performance.now();
      await page.locator('.entry-card .entry-enter').first().click();
      await page.locator('#temple-entry').waitFor({ state: 'hidden', timeout: 90000 });
      const enterMs = performance.now() - entering;
      const ready = snapshot();
      // The scene starts another resource wave after readiness; include it before the next visit.
      await page.waitForTimeout(6000);
      await page.waitForFunction(
        () =>
          performance
            .getEntriesByType('resource')
            .some((resource) => resource.name.includes('/assets/models/pine.glb')),
        null,
        { timeout: 60000 },
      );
      await page.waitForLoadState('networkidle', { timeout: 60000 });
      const settled = snapshot();
      samples.push({ run, visit, entryMs, enterMs, entry, ready, settled });
      console.log(
        JSON.stringify({
          run,
          visit,
          entryMs,
          enterMs,
          entryBytes: entry.networkBytes,
          readyBytes: ready.networkBytes,
          settledBytes: settled.networkBytes,
        }),
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      browser: browser.version(),
      mobile,
      entryOnly,
      network: '10 Mbps, 80 ms simulated latency',
      note: 'Local HTTP; no Brotli/CDN. Timings are controlled samples, not public-site guarantees.',
      samples,
    },
    null,
    2,
  ) + '\n',
);
