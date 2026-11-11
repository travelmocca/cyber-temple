import http from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function captureHttp(createMirrorServer) {
  const root = await mkdtemp(join(tmpdir(), 'mirror-http-contract-'));
  const site = join(root, 'site');
  await mkdir(site);
  await writeFile(join(site, 'index.html'), '<!doctype html><title>Contract</title>0123456789');
  await writeFile(join(site, 'audio.mp3'), '0123456789');
  await writeFile(join(site, 'unknown.extension'), 'unknown');
  await writeFile(join(root, 'outside.txt'), 'outside');
  await symlink(join(root, 'outside.txt'), join(site, 'outside.txt'));
  const app = createMirrorServer({ site });
  app.hub.now = () => 1800000000000;
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const cases = [
    ['GET', '/'],
    ['HEAD', '/'],
    ['POST', '/'],
    ['OPTIONS', '/'],
    ['GET', '/__mirror/payment?method=kakao'],
    ['POST', '/__mirror/payment'],
    ['HEAD', '/__mirror/payment'],
    ['GET', '/api/entry-stage'],
    ['POST', '/api/entry-stage'],
    ['GET', '/api/rooms'],
    ['HEAD', '/api/rooms/village'],
    ['POST', '/api/rooms'],
    ['GET', '/__mirror/health'],
    ['GET', '/missing'],
    ['GET', '/%'],
    ['GET', '/%00'],
    ['GET', '/%5c'],
    ['GET', '/%2e%2e%2foutside.txt'],
    ['GET', '/outside.txt'],
    ['GET', '/unknown.extension'],
    ['GET', '/audio.mp3'],
    ['HEAD', '/audio.mp3'],
    ...[
      'bytes=0-1',
      'bytes=3-',
      'bytes=-3',
      'bytes=0-100',
      'bytes=-100',
      'bytes=10-',
      'bytes=9-0',
      'bytes=-0',
      'bytes=-',
      'bytes=0-1,3-4',
      'bytes=9007199254740992-',
      'invalid',
    ].map((range) => ['GET', '/audio.mp3', range]),
    ['HEAD', '/audio.mp3', 'bytes=3-5'],
  ];
  try {
    const trace = [];
    for (const [method, path, range] of cases) {
      const result = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: app.server.address().port,
            method,
            path,
            headers: range ? { range } : {},
          },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                headers: Object.fromEntries(
                  Object.entries(res.headers).filter(
                    ([key]) => !['date', 'connection', 'keep-alive'].includes(key),
                  ),
                ),
                body: Buffer.concat(chunks).toString('utf8'),
              }),
            );
            res.on('error', reject);
          },
        );
        req.on('error', reject);
        req.end();
      });
      trace.push({ method, path, range: range ?? null, ...result });
    }
    return trace;
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
}
