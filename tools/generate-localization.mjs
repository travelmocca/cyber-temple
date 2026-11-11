import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import prettier from 'prettier';
import { applyPatch, hash } from './apply-patches.mjs';
import { translateText, textUnits, hasKorean, untranslatedUnits } from '../locales/zh-CN.mjs';
import { generateEntry } from './generate-entry.mjs';

const root = new URL('../', import.meta.url);
const targets = [
  'index.html',
  'manifest.webmanifest',
  'assets/index-qXYao_lF.js',
  'assets/game-U0Pmc8tU.js',
];

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['comments', 'extra', 'loc'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function structure(node) {
  if (Array.isArray(node)) return node.map(structure);
  if (!node || typeof node !== 'object') return node;
  const ignored = new Set([
    'start',
    'end',
    'loc',
    'extra',
    'comments',
    'leadingComments',
    'trailingComments',
    'innerComments',
    'errors',
  ]);
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, value]) => value !== undefined && !ignored.has(key) && !key.startsWith('__'))
      .map(([key, value]) => [
        key,
        key === 'value' && ['StringLiteral', 'TemplateElement'].includes(node.type)
          ? '<translated text>'
          : structure(value),
      ]),
  );
}

export async function createLocalizationPatch(source, target, catalogSha256) {
  const edits = [];
  const add = (start, end, after) => {
    const before = source.slice(start, end);
    if (before !== after) edits.push({ start, end, before, after });
  };
  let originalAST;
  if (target.endsWith('.js')) {
    originalAST = (await prettier.__debug.parse(source, { parser: 'babel' })).ast;
    walk(originalAST, (node) => {
      if (node.type === 'StringLiteral' && (hasKorean(node.value) || node.value === 'ko-KR')) {
        const translated = node.value === 'ko-KR' ? 'zh-CN' : translateText(node.value);
        assert.deepEqual(untranslatedUnits(translated), [], `Missing translation in ${target}`);
        add(node.start, node.end, JSON.stringify(translated));
      } else if (node.type === 'TemplateElement' && hasKorean(node.value.raw)) {
        assert.equal(source.slice(node.start, node.end), node.value.raw);
        const translated = translateText(node.value.raw);
        assert.deepEqual(
          untranslatedUnits(translated),
          [],
          `Missing template translation in ${target}`,
        );
        add(node.start, node.end, translated);
      }
    });
  } else {
    for (const unit of textUnits(source))
      if (hasKorean(unit.text)) {
        const translated = translateText(unit.text);
        assert.deepEqual(untranslatedUnits(translated), [], `Missing translation in ${target}`);
        add(unit.start, unit.end, translated);
      }
    for (const [before, after] of target === 'index.html'
      ? [
          ['lang="ko"', 'lang="zh-CN"'],
          ['content="ko_KR"', 'content="zh_CN"'],
        ]
      : [['"lang": "ko"', '"lang": "zh-CN"']]) {
      assert.equal(source.split(before).length, 2);
      const start = source.indexOf(before);
      add(start, start + before.length, after);
    }
  }
  edits.sort((a, b) => a.start - b.start);
  let result = source;
  for (const edit of [...edits].reverse())
    result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
  if (originalAST) {
    const translatedAST = (await prettier.__debug.parse(result, { parser: 'babel' })).ast;
    assert.deepEqual(
      structure(translatedAST),
      structure(originalAST),
      'Localization changed executable structure',
    );
  }
  return {
    id: 'zh-CN-' + target.replaceAll('/', '-'),
    target,
    beforeSha256: hash(source),
    afterSha256: hash(result),
    catalogSha256,
    reason:
      'Simplified Chinese text and locale metadata; executable structure and activity rules unchanged',
    edits,
  };
}

export async function generateLocalization() {
  const registry = JSON.parse(await readFile(new URL('patches/patches.json', root), 'utf8'));
  registry.patches = registry.patches.filter(
    (patch) =>
      !patch.id.startsWith('zh-CN-') &&
      !patch.id.startsWith('temple-entry-') &&
      !patch.id.startsWith('performance-'),
  );
  const catalogSha256 = hash(await readFile(new URL('locales/zh-CN.json', root)));
  const outputs = [];
  for (const target of targets) {
    let source = await readFile(new URL('baseline/site/' + target, root), 'utf8');
    for (const patch of registry.patches.filter((patch) => patch.target === target))
      source = applyPatch(source, patch);
    const patch = await createLocalizationPatch(source, target, catalogSha256);
    registry.patches.push(patch);
    outputs.push({ target, text: applyPatch(source, patch) });
  }
  // Validate every translation before changing any running file.
  for (const { target, text } of outputs) await writeFile(new URL('site/' + target, root), text);
  await writeFile(new URL('patches/patches.json', root), JSON.stringify(registry, null, 2) + '\n');
  return generateEntry();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await generateLocalization()));
}
