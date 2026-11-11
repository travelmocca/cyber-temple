import WebSocket from 'ws';
import { writeFile } from 'node:fs/promises';
const frames = [],
  sockets = [];
const clean = (x) =>
  Array.isArray(x)
    ? x.map(clean)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.entries(x).map(([k, v]) => [
            k,
            /token/i.test(k) ? 'REDACTED' : k === 'name' ? 'visitor' : clean(v),
          ]),
        )
      : x;
const target =
  'wss://sansatemple.com/presence/village?room=maru-20&map=village-1&roomLimit=20&garden=2&protocol=2&wire=3&cafe25=1&construction=overflow-v1&constructionRules=1&resume=1&elastic=1&entryIdle=1&wake=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect(label) {
  const ws = new WebSocket(target, { origin: 'https://sansatemple.com', handshakeTimeout: 15000 });
  sockets.push(ws);
  let snapshot;
  const ready = new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('message', (buf, binary) => {
      let data;
      try {
        data = JSON.parse(buf.toString());
      } catch {
        data = { binary: true, bytes: buf.length };
      }
      frames.push({
        at: new Date().toISOString(),
        client: label,
        direction: 'receive',
        data: clean(data),
      });
      if (data.type === 'snapshot') {
        snapshot = data;
        resolve(ws);
      }
    });
    setTimeout(() => reject(Error('snapshot timeout')), 20000).unref();
  });
  await ready;
  return {
    ws,
    get snapshot() {
      return snapshot;
    },
    send(data) {
      frames.push({
        at: new Date().toISOString(),
        client: label,
        direction: 'send',
        data: clean(data),
      });
      ws.send(JSON.stringify(data));
    },
  };
}
try {
  const a = await connect('a'),
    b = await connect('b');
  a.send({ type: 'sync' });
  b.send({ type: 'sync' });
  await sleep(1000);
  const evidence = {
    roomA: a.snapshot.room,
    roomB: b.snapshot.room,
    instanceA: a.snapshot.instance,
    instanceB: b.snapshot.instance,
    aSeesB: a.snapshot.visitors.some((v) => v.id === b.snapshot.selfId),
    bSeesA: b.snapshot.visitors.some((v) => v.id === a.snapshot.selfId),
  };
  const self = a.snapshot.visitors.find((v) => v.id === a.snapshot.selfId);
  a.send({ type: 'move', ...self.position, pose: 'walk' });
  await sleep(350);
  a.send({ type: 'seat', requestId: 1 });
  b.send({ type: 'seat', requestId: 1 });
  await sleep(1000);
  a.send({ type: 'stand' });
  b.send({ type: 'stand' });
  a.send({ type: 'incense-join', requestId: 2 });
  b.send({ type: 'incense-join', requestId: 2 });
  await sleep(700);
  a.send({ type: 'incense-leave' });
  b.send({ type: 'incense-abandon' });
  await sleep(500);
  a.send({ type: 'sync' });
  await sleep(350);
  a.send({ type: 'room-switch', room: 'maru-19', requestId: 3 });
  await sleep(700);
  await writeFile(
    new URL('../../RECON/mirror/network/source-dual-session.json', import.meta.url),
    JSON.stringify({ target: target.replace(/\?.*/, ''), evidence, frames }, null, 2),
  );
  console.log(
    JSON.stringify({
      evidence,
      frames: frames.length,
      types: [...new Set(frames.map((f) => f.data.type).filter(Boolean))],
    }),
  );
} catch (e) {
  console.error(e.message);
  await writeFile(
    new URL('../../RECON/mirror/network/source-dual-session.json', import.meta.url),
    JSON.stringify({ error: e.message, frames }, null, 2),
  );
  process.exitCode = 1;
} finally {
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send('{"type":"leave"}');
    ws.close();
  }
}
