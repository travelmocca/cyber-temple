import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createMirrorServer } from '../../server/index.mjs';

test(
  'browser counts visits without counting report views and analytics failure does not block entry',
  { timeout: 120000 },
  async () => {
    const app = createMirrorServer({ reportPassword: 'local-test-report-password' });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal'] });
    const context = await browser.newContext();
    const other = await browser.newContext();
    await mkdir('test-results/analytics', { recursive: true });
    try {
      const page = await context.newPage();
      await page.goto(base);
      await page.waitForFunction(async () => (await fetch('/__mirror/health')).ok);
      await page.getByRole('button', { name: '健康', exact: true }).click();
      await page.locator('#entry-refresh').click();
      await page.waitForTimeout(250);
      assert.equal(app.analytics.report().total.pv, 1);
      assert.equal(app.analytics.report().total.uv, 1);
      await page.reload();
      await page.getByRole('button', { name: '心安', exact: true }).click();
      await page.locator('.entry-card .entry-enter').first().click();
      await page.locator('#temple-entry').waitFor({ state: 'hidden', timeout: 50000 });
      await page.waitForTimeout(250);
      assert.equal(app.analytics.report().total.pv, 2);
      assert.equal(app.analytics.report().total.uv, 1);
      assert.equal(app.analytics.report().total.entries, 1);
      const second = await other.newPage();
      await second.goto(base);
      await second.getByRole('button', { name: '健康', exact: true }).waitFor();
      await second.waitForTimeout(250);
      assert.equal(app.analytics.report().total.pv, 3);
      assert.equal(app.analytics.report().total.uv, 2);
      await page.goto(base + '/api/report');
      await page.getByLabel('查看口令').fill('wrong');
      await page.getByRole('button', { name: '查看统计', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await page.getByLabel('查看口令').fill('local-test-report-password');
      await page.getByRole('button', { name: '查看统计', exact: true }).click();
      await page.getByRole('heading', { name: '近30天', exact: true }).waitFor();
      assert.equal(await page.locator('.card').count(), 6);
      assert.equal(app.analytics.report().total.pv, 3);
      await page.screenshot({ path: 'test-results/analytics/desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: 'test-results/analytics/mobile.png', fullPage: true });
      await page.getByRole('button', { name: '退出查看', exact: true }).click();
      await page.getByLabel('查看口令').waitFor();
      const blocked = await browser.newContext();
      try {
        await blocked.route('**/temple-entry/analytics.mjs', (route) => route.abort());
        const failure = await blocked.newPage();
        await failure.goto(base);
        await failure.getByRole('button', { name: '心安', exact: true }).click();
        await failure.locator('.entry-card .entry-enter').first().click();
        await failure.locator('#temple-entry').waitFor({ state: 'hidden', timeout: 50000 });
        assert.equal(app.analytics.report().total.pv, 3);
      } finally {
        await blocked.close();
      }
    } finally {
      await context.close();
      await other.close();
      await browser.close();
      await app.close();
    }
  },
);
