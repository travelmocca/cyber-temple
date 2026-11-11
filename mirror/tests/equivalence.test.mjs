import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureBehavior } from './helpers/behavior-trace.mjs';
import { captureHttp } from './helpers/http-trace.mjs';
import { createMirrorServer } from '../server/index.mjs';

test('all ordered protocol messages and internal state match the pre-refactor implementation', async () => {
  const expected = JSON.parse(
    await readFile(new URL('./fixtures/behavior-before.json', import.meta.url), 'utf8'),
  );
  const actual = await captureBehavior(new URL('../server/presence.mjs', import.meta.url));
  assert.deepEqual(actual, expected);
  // A deliberately changed message must fail the same comparison.
  const changed = structuredClone(actual);
  changed[1].messages[0].message.revision++;
  assert.throws(() => assert.deepEqual(changed, expected), assert.AssertionError);
});

test('HTTP status, headers and bodies match the pre-refactor implementation', async () => {
  const expected = JSON.parse(
    await readFile(new URL('./fixtures/http-before.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(await captureHttp(createMirrorServer), expected);
});
