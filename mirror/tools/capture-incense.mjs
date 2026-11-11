import WebSocket from 'ws';
import { writeFile } from 'node:fs/promises';
const frames = [],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let snapshot;
let queue;
const ws = new WebSocket(
  'wss://sansatemple.com/presence/village?room=maru-20&map=village-1&protocol=2&wire=3&garden=2&roomLimit=20&incense=1&elastic=1',
  { origin: 'https://sansatemple.com', handshakeTimeout: 15000 },
);
const clean = (v) =>
  Array.isArray(v)
    ? v.map(clean)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            /token/i.test(k) ? 'REDACTED' : k === 'name' ? 'visitor' : clean(x),
          ]),
        )
      : v;
const ready = new Promise((resolve, reject) => {
  ws.on('error', reject);
  ws.on('message', (buf) => {
    let data;
    try {
      data = JSON.parse(buf.toString());
    } catch {
      if (buf.length >= 28 && buf.readUInt32BE(0) === 1397642035 && ws.readyState === 1)
        ws.send(JSON.stringify({ type: 'ack', revision: buf.readDoubleBE(12) }));
      return;
    }
    if (Number.isSafeInteger(data.revision) && ws.readyState === 1)
      ws.send(JSON.stringify({ type: 'ack', revision: data.revision }));
    if (data.type === 'snapshot') {
      snapshot = data;
      queue = data.incenseQueue;
      resolve();
    }
    if (data.type === 'incense-queue') queue = data.queue;
    if (!['delta', 'cafe25-state'].includes(data.type))
      frames.push({ direction: 'receive', data: clean(data) });
  });
  setTimeout(() => reject(Error('snapshot timeout')), 20000).unref();
});
const send = (data) => {
  if (ws.readyState !== 1) throw Error('Socket closed before action');
  ws.send(JSON.stringify(data));
  if (data.type !== 'move') frames.push({ direction: 'send', data });
};
const result = {
  evidence:
    'SOURCE public endpoint, published client-compatible movement messages; this is protocol evidence, not browser ritual evidence',
};
ws.on('close', (code, reason) => {
  result.close = { code, reason: reason.toString() };
});
try {
  await ready;
  const initial = snapshot.visitors.find((v) => v.id === snapshot.selfId).position;
  const target = { x: 0, z: 13.058 };
  const steps = Math.ceil(Math.hypot(target.x - initial.x, target.z - initial.z) / 1.1);
  for (let i = 1; i <= steps; i++) {
    await sleep(500);
    send({
      type: 'move',
      x: initial.x + ((target.x - initial.x) * i) / steps,
      z: initial.z + ((target.z - initial.z) * i) / steps,
      yaw: 0,
      pose: 'walk',
    });
  }
  send({ type: 'sync' });
  await sleep(400);
  send({ type: 'incense-join', requestId: 1 });
  await sleep(700);
  result.accepted = frames.some((f) => f.data.type === 'incense-queue-result' && f.data.accepted);
  result.isActive = queue?.activeId === snapshot.selfId;
  if (result.isActive) {
    send({ type: 'incense-start' });
    await sleep(500);
  }
  send({ type: 'incense-leave' });
  await sleep(400);
  send({ type: 'sync' });
  await sleep(300);
} catch (e) {
  result.error = e.message;
} finally {
  if (ws.readyState === 1) {
    send({ type: 'leave' });
    ws.close();
  }
  await writeFile(
    new URL('../../RECON/mirror/network/source-incense-near-altar.json', import.meta.url),
    JSON.stringify({ ...result, frames }, null, 2),
  );
  console.log(JSON.stringify(result));
}
