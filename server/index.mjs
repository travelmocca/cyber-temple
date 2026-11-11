import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PresenceHub } from './presence.mjs';
import { createRequestHandler } from './http.mjs';
import { createWebSocketServer, attachWebSocketTransport } from './websocket.mjs';
const SITE = fileURLToPath(new URL('../site/', import.meta.url));

export function createMirrorServer({ site = SITE, staticOnly = false } = {}) {
  const hub = new PresenceHub(),
    wss = createWebSocketServer();
  const server = http.createServer(createRequestHandler({ site, hub }));
  attachWebSocketTransport({ server, hub, wss, staticOnly });
  const timer = setInterval(() => hub.tick(), 1000);
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  };
  return { server, hub, wss, close };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, close } = createMirrorServer({
    staticOnly: process.argv.includes('--static-only'),
  });
  server.listen(Number(process.env.PORT ?? 4191), process.env.HOST ?? '127.0.0.1', () =>
    console.log('Sansa mirror listening on http://127.0.0.1:' + server.address().port),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => close().then(() => process.exit()));
}
