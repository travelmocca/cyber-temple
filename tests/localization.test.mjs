import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyPatch, hash } from '../tools/apply-patches.mjs';
import { createLocalizationPatch } from '../tools/generate-localization.mjs';
import { translateText } from '../locales/zh-CN.mjs';
import vm from 'node:vm';
import prettier from 'prettier';

test('Chinese entry and app manifest declare their actual language', async () => {
  const page = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.match(page, /<html lang="zh-CN">/);
  assert.match(page, /山寺，歇一会儿/);
  assert.doesNotMatch(page, /[\uac00-\ud7a3]/u);
  const manifest = JSON.parse(
    await readFile(new URL('../site/manifest.webmanifest', import.meta.url)),
  );
  assert.equal(manifest.lang, 'zh-CN');
});

test('optimized Chinese UI keeps the base font and does not request the extended font', async () => {
  const page = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../site/assets/game-CvBwdk0t.css', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /rel="preload"[^>]+SansaQuietUI-Core/);
  assert.doesNotMatch(css, /SansaQuietUI-Remainder\.woff2/);
  assert.match(css, /SansaQuietUI-Core\.woff2/);
});

test('localized templates preserve dynamic values, markup, IDs and executable expressions', async () => {
  const source =
    'const count = 3; globalThis.label = `앞에 ${count}명이 있어요 · 차례가 되면 다가갑니다`; globalThis.html = `<button id="unchanged">커피 내리기</button>`;';
  const patch = await createLocalizationPatch(source, 'example.js', 'test');
  const result = applyPatch(source, patch);
  const context = {};
  vm.runInNewContext(result, context);
  assert.equal(context.label, '前方还有 3人 · 轮到你时会自动上前');
  assert.equal(context.html, '<button id="unchanged">制作咖啡</button>');
  assert.equal(translateText('  커피 내리기  '), '  制作咖啡  ');
});

test('published Chinese bundles contain no untranslated Korean string or template text', async () => {
  for (const file of ['game-U0Pmc8tU.js', 'index-qXYao_lF.js']) {
    const source = await readFile(new URL('../site/assets/' + file, import.meta.url), 'utf8');
    const { ast } = await prettier.__debug.parse(source, { parser: 'babel' });
    function check(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'StringLiteral') assert.doesNotMatch(node.value, /[\uac00-\ud7a3]/u);
      if (node.type === 'TemplateElement') assert.doesNotMatch(node.value.raw, /[\uac00-\ud7a3]/u);
      for (const [key, value] of Object.entries(node))
        if (!['comments', 'extra', 'loc'].includes(key)) {
          if (Array.isArray(value)) value.forEach(check);
          else if (value && typeof value === 'object') check(value);
        }
    }
    check(ast);
  }
});

test('audited text edits validate offsets, preimages, ordering and final hash', () => {
  const before = 'hello name, hello name';
  const after = '你好 name, 你好 name';
  const patch = {
    beforeSha256: hash(before),
    afterSha256: hash(after),
    edits: [
      { start: 0, end: 5, before: 'hello', after: '你好' },
      { start: 12, end: 17, before: 'hello', after: '你好' },
    ],
  };
  assert.equal(applyPatch(before, patch), after);
  assert.equal(applyPatch(after, patch), after);
  assert.throws(
    () => applyPatch(before, { ...patch, edits: [{ ...patch.edits[0], start: 1 }] }),
    /edit/,
  );
  assert.throws(
    () => applyPatch(before, { ...patch, edits: [patch.edits[1], patch.edits[0]] }),
    /edit/,
  );
  assert.throws(
    () =>
      applyPatch(before, {
        ...patch,
        edits: [{ start: 0, end: 5, before: 'other', after: '你好' }],
      }),
    /edit/,
  );
  assert.throws(
    () => applyPatch(before, { ...patch, edits: [patch.edits[0], patch.edits[0]] }),
    /edit/,
  );
  assert.throws(() => applyPatch(before, { ...patch, afterSha256: hash('wrong') }), /result/);
});
