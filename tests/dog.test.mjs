import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDogPatrol, DOG_BOUNDS } from '../entry/dog.mjs';

function seeded(seed = 19) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

test('patrol leaves room for the whole animated body rather than only its centre', () => {
  createDogPatrol({
    isWalkable: (_x, _z, radius) => {
      assert.ok(radius >= 0.55);
      return true;
    },
  });
});

test('dog explores the courtyard and waits without crossing blocked segments or bounds', () => {
  const clear = (x, z, radius) => !(x > -0.5 - radius && x < 0.5 + radius && z < 38);
  const patrol = createDogPatrol({ random: seeded(), isWalkable: clear });
  const phases = new Set();
  let travelled = 0;
  for (let frame = 0; frame < 180 * 60; frame++) {
    const before = { ...patrol.state };
    patrol.update(1 / 60);
    const s = patrol.state;
    phases.add(s.phase);
    const distance = Math.hypot(s.x - before.x, s.z - before.z);
    travelled += distance;
    assert.ok(distance <= 0.72 / 60 + 1e-8);
    assert.ok(s.x >= DOG_BOUNDS.minX && s.x <= DOG_BOUNDS.maxX);
    assert.ok(s.z >= DOG_BOUNDS.minZ && s.z <= DOG_BOUNDS.maxZ);
    for (let t = 0; t <= 1; t += 0.25)
      assert.ok(clear(before.x + (s.x - before.x) * t, before.z + (s.z - before.z) * t, 0.55));
    if (s.speed > 0) {
      const heading = Math.atan2(s.x - before.x, s.z - before.z);
      assert.ok(Math.abs(Math.atan2(Math.sin(s.yaw - heading), Math.cos(s.yaw - heading))) < 0.12);
    }
  }
  assert.deepEqual([...phases].sort(), ['idle', 'walk']);
  assert.ok(travelled > 20);
});

test('blocked destinations and tab-resume frame times cannot teleport the dog', () => {
  let blocked = false;
  const patrol = createDogPatrol({ random: seeded(), isWalkable: () => !blocked });
  blocked = true;
  const start = { ...patrol.state };
  for (const dt of [NaN, Infinity, -1, 0, 60, ...Array(500).fill(0.05)]) patrol.update(dt);
  assert.equal(patrol.state.x, start.x);
  assert.equal(patrol.state.z, start.z);
  assert.equal(patrol.state.speed, 0);
  assert.ok(Number.isFinite(patrol.state.yaw));
});

test('a newly blocked route stops safely and a fully blocked spawn is rejected', () => {
  let clear = true;
  const patrol = createDogPatrol({ random: seeded(), isWalkable: () => clear });
  for (let n = 0; n < 1000 && patrol.state.speed === 0; n++) patrol.update(0.05);
  assert.ok(patrol.state.speed > 0);
  clear = false;
  const before = { ...patrol.state };
  patrol.update(0.05);
  assert.equal(patrol.state.x, before.x);
  assert.equal(patrol.state.z, before.z);
  assert.equal(patrol.state.speed, 0);
  assert.throws(() => createDogPatrol({ isWalkable: () => false }), /walkable/i);
});

test('the pinned CC0 dog is a self-contained GLB with skeletal idle and walk clips', async () => {
  const source = JSON.parse(await readFile(new URL('../entry/dog/source.json', import.meta.url)));
  const bytes = await readFile(new URL('../entry/dog/' + source.file, import.meta.url));
  assert.equal(source.license, 'CC0-1.0');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  assert.equal(bytes.length, source.bytes);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(gltf.skins.length > 0);
  for (const name of ['AnimalArmature|Idle', 'AnimalArmature|Walk'])
    assert.ok(gltf.animations.some((clip) => clip.name === name));
  assert.ok(gltf.buffers.every((buffer) => !buffer.uri));
  assert.ok((gltf.images ?? []).every((image) => !image.uri));
});
