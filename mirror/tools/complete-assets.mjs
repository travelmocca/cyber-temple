import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url),
  recon = new URL('../../RECON/mirror/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('baseline/manifest.json', root)));
const existingPatches = await readFile(new URL('patches/patches.json', root), 'utf8')
  .then(JSON.parse)
  .catch(() => null);
if (existingPatches?.patches?.length > 1)
  throw Error('Frozen runtime has audited patches. Do not recapture in this directory.');
const files = new Map(manifest.files.map((f) => [new URL(f.url).pathname, f]));
const queue = [],
  seen = new Set(),
  failures = [],
  edges = [];
const sha = (b) => createHash('sha256').update(b).digest('hex');
function add(value, base, reason) {
  if (value.includes('${') || value.includes(' ') || value.includes('<')) return;
  let u;
  try {
    u = new URL(value, base);
  } catch {
    return;
  }
  if (
    u.origin !== 'https://sansatemple.com' ||
    (!/^\/(?:assets|fonts|audio|v|og)\//.test(u.pathname) &&
      !/^\/(?:favicon[^/]*|apple-touch-icon.png|icon-\d+.png|manifest.webmanifest)$/.test(
        u.pathname,
      ))
  )
    return;
  if (
    !/\.(?:js|css|jpg|jpeg|png|webp|svg|ico|woff2?|ttf|mp3|wav|ogg|glb|bin|wasm|webmanifest|txt)$/.test(
      u.pathname,
    )
  )
    return;
  edges.push({ from: base, to: u.href, evidence: reason });
  if (!seen.has(u.pathname)) {
    seen.add(u.pathname);
    queue.push(u);
  }
}
function discover(text, base) {
  const rx = /["'`(]((?:https?:\/\/|\.?\.?\/)[^"'`()\s<>]{1,350})["'`)]/g;
  for (const m of text.matchAll(rx)) add(m[1], base, 'published-file');
  for (const m of text.matchAll(/sourceMappingURL=([^\s]+)/g))
    add(m[1], base, 'source-map-reference');
}
for (const f of files.values()) {
  seen.add(new URL(f.url).pathname);
  if (/\.(?:js|css|html|webmanifest)$/.test(f.path))
    discover(await readFile(new URL('baseline/site/' + f.path, root), 'utf8'), f.url);
}
add(
  './audio/moktak-hit-natural.wav?v=c3f11da43c87',
  'https://sansatemple.com/',
  'published document.baseURI reference',
);
for (const name of ['forest', 'bird-calls', 'footsteps', 'leaves', 'night'])
  add(
    '/audio/village/' + name + '.mp3',
    'https://sansatemple.com/',
    'published dynamic audio naming',
  );
for (const url of [
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  '/og/sansa-rest-20261101-v11.png',
])
  add(url, 'https://sansatemple.com/', 'entry metadata');
let completed = 0;
while (queue.length) {
  const batch = queue.splice(0, 5);
  await Promise.all(
    batch.map(async (u) => {
      if (files.has(u.pathname)) return;
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(30000) }),
          body = Buffer.from(await res.arrayBuffer()),
          type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html') || body.length === 0)
          throw Error('invalid asset ' + res.status + ' ' + type);
        const path = decodeURIComponent(u.pathname.slice(1));
        await mkdir(new URL('baseline/site/' + path.replace(/[^/]+$/, ''), root), {
          recursive: true,
        });
        await writeFile(new URL('baseline/site/' + path, root), body);
        files.set(u.pathname, {
          url: u.href,
          finalURL: res.url,
          path,
          status: res.status,
          contentType: type,
          bytes: body.length,
          sha256: sha(body),
          capturedAt: new Date().toISOString(),
          discovery: 'published-file-reference',
        });
        if (/\.(?:js|css|webmanifest)$/.test(path)) discover(body.toString(), u.href);
        if (++completed % 10 === 0) console.log('downloaded', completed, 'queued', queue.length);
      } catch (e) {
        failures.push({ url: u.href, error: e.message });
      }
    }),
  );
}
const initial = files.get('/');
const recheck = Buffer.from(await (await fetch('https://sansatemple.com/')).arrayBuffer());
if (initial.sha256 !== sha(recheck)) {
  const original = await readFile(new URL('baseline/site/index.html', root), 'utf8');
  const strip = (text) =>
    text.replace(
      /<script[^>]+src="https:\/\/static\.cloudflareinsights\.com\/[^>]+><\/script>\s*/g,
      '',
    );
  if (strip(original) !== strip(recheck.toString())) throw Error('entry changed during capture');
  await writeFile(
    new URL('network/entry-response-variant.json', recon),
    JSON.stringify(
      {
        reason:
          'Cloudflare injects analytics by request context; application HTML is identical after removing only beacon script',
        browserSha256: initial.sha256,
        httpClientSha256: sha(recheck),
      },
      null,
      2,
    ),
  );
}
for (const f of [...files.values()].filter((f) =>
  /\/assets\/(?:index-|game-).+\.js$/.test(f.url),
)) {
  const b = Buffer.from(await (await fetch(f.url)).arrayBuffer());
  if (f.sha256 !== sha(b)) throw Error('bundle changed: ' + f.url);
}
manifest.files = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
manifest.completedAt = new Date().toISOString();
await writeFile(new URL('baseline/manifest.json', root), JSON.stringify(manifest, null, 2));
await writeFile(
  new URL('resource-graph.json', recon),
  JSON.stringify(
    {
      edges,
      failures,
      scope: 'identified references, not proof of exhaustive hidden-content discovery',
    },
    null,
    2,
  ),
);
await writeFile(
  new URL('network/download-failures.json', recon),
  JSON.stringify(failures, null, 2),
);
const version = JSON.parse(await readFile(new URL('source-version.json', recon)));
version.frozenFiles = manifest.files
  .filter((f) => /\.(?:html|js|css)$/.test(f.path))
  .map(({ path, sha256 }) => ({ path, sha256 }));
version.freezeRecheckedAt = new Date().toISOString();
await writeFile(new URL('source-version.json', recon), JSON.stringify(version, null, 2));
await cp(new URL('baseline/site/', root), new URL('site/', root), { recursive: true });
const html = await readFile(new URL('baseline/site/index.html', root), 'utf8'),
  beacon = html.match(
    /<script[^>]+src="https:\/\/static\.cloudflareinsights\.com\/[^>]+><\/script>/,
  )?.[0];
const patches = beacon
  ? [
      {
        id: 'remove-injected-analytics',
        target: 'index.html',
        beforeSha256: sha(html),
        afterSha256: sha(html.replace(beacon, '')),
        before: beacon,
        after: '',
        reason:
          'Remove Cloudflare-injected tracking and its external request; rendering and interaction are unchanged',
        experience: ['I01', 'X01'],
      },
    ]
  : [];
await writeFile(
  new URL('patches/patches.json', root),
  JSON.stringify({ source: 'https://sansatemple.com/', patches }, null, 2),
);
console.log(
  JSON.stringify({
    files: files.size,
    bytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
    failures,
  }),
);
