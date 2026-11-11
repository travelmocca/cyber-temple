import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import WebSocket from 'ws';
import { createMirrorServer } from '../server/index.mjs';
test('static responses have real MIME, audio ranges, HEAD, and no traversal', async () => {
  const { server, close } = createMirrorServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const asset = await fetch(base + '/assets/game-U0Pmc8tU.js', { method: 'HEAD' });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.equal((await asset.arrayBuffer()).byteLength, 0);
    const range = await fetch(base + '/audio/temple-chant-review-v1.mp3', {
      headers: { range: 'bytes=0-1' },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 2);
    assert.match(range.headers.get('content-range'), /^bytes 0-1\//);
    assert.equal(
      (
        await fetch(base + '/audio/temple-chant-review-v1.mp3', {
          headers: { range: 'bytes=99999999999-' },
        })
      ).status,
      416,
    );
    assert.equal((await fetch(base + '/missing.glb')).status, 404);
    const status = await new Promise((resolve, reject) => {
      http
        .get(base + '/%2e%2e%2fpackage.json', (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(status, 403);
  } finally {
    await close();
  }
});
test('real WebSockets receive valid village snapshots and same-room updates', async () => {
  const { server, close } = createMirrorServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'ws://127.0.0.1:' + server.address().port;
  const sockets = [];
  const join = async () => {
    const ws = new WebSocket(base + '/presence/village?room=maru&map=village-1');
    sockets.push(ws);
    const [data] = await once(ws, 'message');
    return { ws, snapshot: JSON.parse(data) };
  };
  try {
    const a = await join(),
      b = await join();
    assert.equal(a.snapshot.map, 'village-1');
    assert.equal(b.snapshot.visitors.length, 2);
    a.ws.send(JSON.stringify({ type: 'hello' }));
    let msg;
    do {
      [msg] = await once(b.ws, 'message');
      msg = JSON.parse(msg);
    } while (msg.type !== 'event');
    assert.equal(msg.event.id, a.snapshot.selfId);
  } finally {
    for (const ws of sockets) ws.terminate();
    await close();
  }
});
test('payment target is a local simulation with no provider redirect', async () => {
  const { server, close } = createMirrorServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const r = await fetch(
      'http://127.0.0.1:' + server.address().port + '/__mirror/payment?method=kakao',
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('location'), null);
    assert.match(await r.text(), /模拟供养/);
  } finally {
    await close();
  }
});
test('invalid WebSocket origins are rejected without crashing the server', async () => {
  const { server, close } = createMirrorServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = '127.0.0.1:' + server.address().port;
  try {
    const ws = new WebSocket('ws://' + endpoint + '/presence/village', { origin: 'null' });
    const status = await new Promise((resolve, reject) => {
      ws.on('unexpected-response', (_, res) => {
        res.resume();
        resolve(res.statusCode);
        ws.terminate();
      });
      ws.on('error', () => {});
      setTimeout(() => reject(Error('origin rejection timeout')), 3000).unref();
    });
    assert.equal(status, 403);
    assert.equal((await fetch('http://' + endpoint + '/__mirror/health')).status, 200);
  } finally {
    await close();
  }
});
