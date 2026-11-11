import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureBehavior } from './helpers/behavior-trace.mjs';
import { captureHttp } from './helpers/http-trace.mjs';
import { createMirrorServer } from '../server/index.mjs';
import { translateText } from '../locales/zh-CN.mjs';

test('all ordered protocol messages and internal state match the pre-refactor implementation', async () => {
  const expected = JSON.parse(
    await readFile(new URL('./fixtures/behavior-before.json', import.meta.url), 'utf8'),
    (key, value) =>
      key === 'name' && typeof value === 'string'
        ? value.replace(/^고요한 방문자 /u, translateText('고요한 방문자') + ' ')
        : value,
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
  // Keep the historical fixture intact; allow only this requested page translation.
  for (const response of expected)
    if (response.path.startsWith('/__mirror/payment'))
      response.body = translateText(response.body).replace('lang="ko"', 'lang="zh-CN"');
  assert.deepEqual(await captureHttp(createMirrorServer), expected);
});
