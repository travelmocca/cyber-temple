import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdtemp, rm, mkdir, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import { createAnalytics } from '../server/analytics.mjs';
import { createMirrorServer } from '../server/index.mjs';

test('PV/UV deduplicate event IDs, preserve history and use Shanghai calendar days', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'temple-analytics-'));
  const path = join(dir, 'analytics.sqlite');
  let now = Date.parse('2026-11-11T15:59:00Z');
  let store = createAnalytics({ path, now: () => now });
  const visitor = randomUUID();
  const event = { id: randomUUID(), visitor, type: 'pageview' };
  try {
    store.record(event);
    store.record(event);
    store.record({ ...event, id: randomUUID() });
    store.record({ id: randomUUID(), visitor, type: 'enter' });
    assert.equal(store.report().total.pv, 2);
    assert.equal(store.report().total.uv, 1);
    assert.equal(store.report().total.enteredUsers, 1);
    now = Date.parse('2026-11-11T16:01:00Z');
    store.record({ id: randomUUID(), visitor, type: 'pageview' });
    store.record({ id: randomUUID(), visitor: randomUUID(), type: 'pageview' });
    assert.equal(store.report().today.date, '2026-11-12');
    assert.equal(store.report().today.pv, 2);
    assert.equal(store.report().today.uv, 2);
    assert.equal(store.report().total.pv, 4);
    assert.equal(store.report().total.uv, 2);
    assert.equal(store.report().days.length, 30);
    assert.equal(store.report().days[0].collected, true);
    assert.equal(store.report().days.at(-1).collected, false);
    assert.equal(store.report().days.at(-1).pv, null);
    store.close();
    store = createAnalytics({ path, now: () => now });
    assert.equal(store.report().total.pv, 4);
    assert.equal(store.report().total.uv, 2);
    assert.throws(() => store.record({ ...event, type: 'unknown' }));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('report requires a password, rejects foreign collection and does not inflate PV', async () => {
  const app = createMirrorServer({ reportPassword: 'test-only-report-password' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const before = await fetch(base + '/api/report?format=json');
    assert.equal(before.status, 401);
    assert.match(before.headers.get('cache-control'), /no-store/);
    const body = JSON.stringify({ id: randomUUID(), visitor: randomUUID(), type: 'pageview' });
    const post = (origin) =>
      fetch(base + '/api/analytics', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body,
      });
    assert.equal((await post('https://foreign.example')).status, 403);
    assert.equal((await post(base)).status, 204);
    assert.equal((await post(base)).status, 204);
    const login = await fetch(base + '/api/report/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=test-only-report-password',
    });
    assert.equal(login.status, 303);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const secureLogin = await fetch(base + '/api/report/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: base.replace('http:', 'https:'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'password=test-only-report-password',
    });
    assert.match(secureLogin.headers.get('set-cookie'), /; Secure/);
    const stats = await fetch(base + '/api/report?format=json', { headers: { cookie } });
    assert.equal(stats.status, 200);
    assert.equal((await stats.json()).total.pv, 1);
    assert.equal(
      (
        await fetch(base + '/api/report?format=json', {
          headers: { cookie: cookie.replace('temple_report=', 'temple_report=x') },
        })
      ).status,
      401,
    );
    const payload = `${Date.now() - 1000}.${'a'.repeat(32)}`;
    const expired =
      'temple_report=' +
      payload +
      '.' +
      createHmac('sha256', 'test-only-report-password').update(payload).digest('hex');
    assert.equal(
      (await fetch(base + '/api/report?format=json', { headers: { cookie: expired } })).status,
      401,
    );
    assert.equal(app.analytics.report().total.pv, 1);
    assert.equal((await fetch(base + '/data/analytics.sqlite')).status, 404);
  } finally {
    await app.close();
  }
});

test('invalid and oversized events never change counters; failed passwords are rate-limited', async () => {
  const app = createMirrorServer({ reportPassword: 'test-only-report-password' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    for (const [body, status] of [
      ['{bad', 400],
      ['{}', 400],
      [JSON.stringify({ id: [randomUUID()], visitor: randomUUID(), type: 'pageview' }), 400],
      [JSON.stringify({ id: randomUUID(), visitor: [randomUUID()], type: 'pageview' }), 400],
      ['x'.repeat(2048), 413],
    ]) {
      const response = await fetch(base + '/api/analytics', {
        method: 'POST',
        headers: { origin: base, 'content-type': 'application/json' },
        body,
      });
      assert.equal(response.status, status);
    }
    assert.equal(app.analytics.report().total.pv, 0);
    for (let i = 0; i < 9; i++) {
      const response = await fetch(base + '/api/report/login', {
        method: 'POST',
        headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'password=wrong',
      });
      assert.equal(response.status, i === 8 ? 429 : 401);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  } finally {
    await app.close();
  }
});

test(
  'simultaneous login bodies cannot bypass the failed-password limit',
  { timeout: 10000 },
  async () => {
    const app = createMirrorServer({ reportPassword: 'test-only-report-password' });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const requests = [];
    try {
      let received = 0;
      const headersArrived = new Promise((resolve) =>
        app.server.on('request', (req) => {
          if (req.url === '/api/report/login' && ++received === 20) resolve();
        }),
      );
      const results = Array.from(
        { length: 20 },
        () =>
          new Promise((resolve, reject) => {
            const req = http.request(
              base + '/api/report/login',
              {
                method: 'POST',
                headers: {
                  origin: base,
                  'content-type': 'application/x-www-form-urlencoded',
                  'content-length': Buffer.byteLength('password=wrong'),
                },
              },
              (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode));
              },
            );
            req.on('error', reject);
            req.flushHeaders();
            requests.push(req);
          }),
      );
      await headersArrived;
      for (const req of requests) req.end('password=wrong');
      const statuses = await Promise.all(results);
      assert.equal(statuses.filter((status) => status === 401).length, 8);
      assert.equal(statuses.filter((status) => status === 429).length, 12);
    } finally {
      for (const req of requests) req.destroy();
      await app.close();
    }
  },
);

test('database files remain private even when a configured directory is symlinked into static files', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'temple-private-db-')));
  await mkdir(join(dir, 'public'));
  await symlink(join(dir, 'public'), join(dir, 'alias'));
  const app = createMirrorServer({
    site: join(dir, 'public'),
    analyticsPath: join(dir, 'alias/analytics.sqlite'),
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + app.server.address().port;
    for (const path of ['/analytics.sqlite', '/analytics.sqlite-wal', '/analytics.sqlite-shm'])
      assert.equal((await fetch(base + path)).status, 403);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('missing report password never exposes report data', async () => {
  const app = createMirrorServer();
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  try {
    const response = await fetch('http://127.0.0.1:' + app.server.address().port + '/api/report');
    assert.equal(response.status, 503);
    assert.match(await response.text(), /REPORT_PASSWORD/);
  } finally {
    await app.close();
  }
});
