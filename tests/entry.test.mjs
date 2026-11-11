import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('entry catalog has eight approved labels and 2–5 Buddhist temples in every region', async () => {
  const catalog = JSON.parse(await readFile(new URL('../entry/catalog.json', import.meta.url)));
  assert.deepEqual(
    catalog.categories.map((c) => c.label),
    ['求财', '事业', '姻缘', '健康', '学业', '家庭', '转运', '心安'],
  );
  assert.equal(catalog.temples.length, 84);
  const regions = Map.groupBy(catalog.temples, (t) => t.region);
  assert.equal(regions.size, 34);
  assert.ok([...regions.values()].every((list) => list.length >= 2 && list.length <= 5));
  assert.equal(new Set(catalog.temples.map((t) => t.id)).size, 84);
  assert.ok(catalog.temples.every((t) => t.name && t.description && t.wishes.length));
});

test('recommendation rounds prefer unseen temples and never duplicate a batch', async () => {
  const { recommend } = await import('../entry/recommend.mjs');
  const pool = Array.from({ length: 11 }, (_, i) => ({
    id: String(i),
    wishes: [{ categoryId: 'love' }],
  }));
  const first = recommend(pool, 'love', [], [], () => 0.4);
  const second = recommend(pool, 'love', first.seen, first.ids, () => 0.4);
  assert.equal(first.ids.length, 5);
  assert.ok(second.ids.every((id) => !first.ids.includes(id)));
  const third = recommend(pool, 'love', second.seen, second.ids, () => 0.4);
  assert.equal(new Set(third.ids).size, 5);
  assert.ok(third.ids.includes(pool.find((t) => !second.seen.includes(t.id)).id));
  assert.equal(third.repeated, true);
  assert.equal(third.seen.length, 11);
  const fourth = recommend(pool, 'love', third.seen, third.ids, () => 0.4);
  assert.equal(fourth.newRound, true);
  assert.ok(fourth.ids.every((id) => !third.ids.includes(id)));
});

test('small pools and unknown categories return actual matching counts', async () => {
  const { recommend } = await import('../entry/recommend.mjs');
  const pool = [
    { id: 'a', wishes: [{ categoryId: 'wealth' }] },
    { id: 'b', wishes: [{ categoryId: 'peace' }] },
  ];
  assert.deepEqual(recommend(pool, 'wealth').ids, ['a']);
  assert.deepEqual(recommend(pool, 'invalid').ids, []);
  assert.deepEqual(recommend([{ ...pool[0], enabled: false }], 'wealth').ids, []);
});
