import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createMirrorServer } from '../server/index.mjs';

test('static validators avoid repeat bodies and immutable caching requires a valid version', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'temple-cache-')));
  const site = join(root, 'site');
  await mkdir(site);
  await writeFile(join(site, 'index.html'), 'first');
  await writeFile(join(site, 'asset.js'), 'const value=1;');
  const app = createMirrorServer({ site });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const first = await fetch(base);
    assert.equal(first.status, 200);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.equal(first.headers.get('cache-control'), 'no-cache');
    const fresh = await fetch(base, { headers: { 'if-none-match': 'W/' + etag } });
    assert.equal(fresh.status, 304);
    assert.equal(await fresh.text(), '');
    await writeFile(join(site, 'index.html'), 'second version');
    const changed = await fetch(base, { headers: { 'if-none-match': etag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.equal(await changed.text(), 'second version');
    const htmlVersion = createHash('sha256').update('second version').digest('hex').slice(0, 12);
    assert.equal(
      (await fetch(base + '/?v=' + htmlVersion)).headers.get('cache-control'),
      'no-cache',
    );
    const version = createHash('sha256').update('const value=1;').digest('hex').slice(0, 12);
    const immutable = await fetch(base + '/asset.js?v=' + version);
    assert.match(immutable.headers.get('cache-control'), /max-age=31536000, immutable/);
    const fake = await fetch(base + '/asset.js?v=not-a-version');
    assert.equal(fake.headers.get('cache-control'), 'no-cache');
    const range = await fetch(base + '/asset.js', { headers: { range: 'bytes=0-4' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), 'const');
    const staleRange = await fetch(base + '/asset.js', {
      headers: { range: 'bytes=0-4', 'if-range': '"old"' },
    });
    assert.equal(staleRange.status, 200);
    assert.equal(await staleRange.text(), 'const value=1;');
    const catalog = await fetch(base + '/temple-entry/catalog.json');
    assert.equal(catalog.headers.get('cache-control'), 'no-cache');
    const catalogVersion = createHash('sha256')
      .update(await catalog.text())
      .digest('hex')
      .slice(0, 12);
    for (const path of ['/temple-entry/catalog.json', '/temple-entry//catalog.json'])
      assert.equal(
        (await fetch(base + path + '?v=' + catalogVersion)).headers.get('cache-control'),
        'no-cache',
      );
    const health = await fetch(base + '/__mirror/health');
    assert.equal(health.headers.get('cache-control'), 'no-store');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
