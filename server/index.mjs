import http from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PresenceHub } from './presence.mjs';
import { createRequestHandler } from './http.mjs';
import { createWebSocketServer, attachWebSocketTransport } from './websocket.mjs';
import { createAnalytics } from './analytics.mjs';
const SITE = fileURLToPath(new URL('../site/', import.meta.url));

export function createMirrorServer({
  site = SITE,
  staticOnly = false,
  analyticsPath = ':memory:',
  reportPassword = '',
} = {}) {
  if (analyticsPath !== ':memory:') {
    const filename = resolve(analyticsPath);
    for (const root of [resolve(site), fileURLToPath(new URL('../entry', import.meta.url))])
      if (filename === root || filename.startsWith(root + sep))
        throw new Error('Analytics database must be outside public static directories');
  }
  const analytics = createAnalytics({ path: analyticsPath });
  const hub = new PresenceHub(),
    wss = createWebSocketServer();
  const server = http.createServer(createRequestHandler({ site, hub, analytics, reportPassword }));
  attachWebSocketTransport({ server, hub, wss, staticOnly });
  const timer = setInterval(() => hub.tick(), 1000);
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
    analytics.close();
  };
  return { server, hub, wss, analytics, close };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, close } = createMirrorServer({
    staticOnly: process.argv.includes('--static-only'),
    analyticsPath:
      process.env.ANALYTICS_DB ??
      fileURLToPath(new URL('../data/analytics.sqlite', import.meta.url)),
    reportPassword: process.env.REPORT_PASSWORD ?? '',
  });
  server.listen(Number(process.env.PORT ?? 4191), process.env.HOST ?? '127.0.0.1', () =>
    console.log('Sansa mirror listening on http://127.0.0.1:' + server.address().port),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => close().then(() => process.exit()));
}
