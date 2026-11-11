import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { applyPatch, hash, verifyAssets } from './apply-patches.mjs';

const root = new URL('../', import.meta.url);

export async function generatePerformance() {
  const registry = JSON.parse(await readFile(new URL('patches/patches.json', root)));
  registry.patches = registry.patches.filter((patch) => !patch.id.startsWith('performance-'));
  const outputs = [];
  async function patch(target, replacements, dependencies = {}) {
    let before = await readFile(new URL('baseline/site/' + target, root), 'utf8');
    for (const existing of registry.patches.filter((item) => item.target === target))
      before = applyPatch(before, existing);
    const edits = replacements
      .map(([from, to]) => {
        if (!from || before.split(from).length !== 2)
          throw new Error('Performance patch must match once: ' + target);
        const start = before.indexOf(from);
        return { start, end: start + from.length, before: from, after: to };
      })
      .sort((a, b) => a.start - b.start);
    let after = before;
    for (const edit of [...edits].reverse())
      after = after.slice(0, edit.start) + edit.after + after.slice(edit.end);
    const item = {
      id: 'performance-' + target.replaceAll('/', '-'),
      target,
      beforeSha256: hash(before),
      afterSha256: hash(after),
      edits,
      dependencies,
      reason:
        'Remove unused extended font and version resource URLs; scene and activity logic unchanged',
    };
    registry.patches.push(item);
    outputs.push({ target, text: applyPatch(before, item) });
    return after;
  }

  const cssPath = 'assets/game-CvBwdk0t.css';
  const originalCSS = await readFile(new URL('baseline/site/' + cssPath, root), 'utf8');
  const extendedFont = originalCSS.match(/@font-face\{[^}]*SansaQuietUI-Remainder[^}]*\}/g);
  if (extendedFont?.length !== 1) throw new Error('Expected one extended font face');
  const css = await patch(cssPath, [[extendedFont[0], '']]);
  const gamePath = 'assets/game-U0Pmc8tU.js';
  const gameDigest = hash(await readFile(new URL('site/' + gamePath, root)));
  const cssDigest = hash(css);
  await patch(
    'assets/index-qXYao_lF.js',
    [
      [`"${gamePath}"`, `"${gamePath}?v=${gameDigest.slice(0, 12)}"`],
      [`"./game-U0Pmc8tU.js"`, `"./game-U0Pmc8tU.js?v=${gameDigest.slice(0, 12)}"`],
      [`"${cssPath}"`, `"${cssPath}?v=${cssDigest.slice(0, 12)}"`],
      // Vite's preload helper must still recognize CSS after adding a query version.
      ['i.endsWith(".css")', 'i.split("?")[0].endsWith(".css")'],
    ],
    { ['site/' + gamePath]: gameDigest, ['site/' + cssPath]: cssDigest },
  );

  const entryDependencies = {};
  const versions = {};
  for (const name of ['entry.css', 'entry.mjs']) {
    const digest = hash(await readFile(new URL('entry/' + name, root)));
    entryDependencies['entry/' + name] = digest;
    versions[name] = digest.slice(0, 12);
  }
  const html = await readFile(new URL('baseline/site/index.html', root), 'utf8');
  const preload = html.match(/<link rel="preload"[^>]+SansaQuietUI-Core[^>]+>/g);
  if (preload?.length !== 1) throw new Error('Expected one base font preload');
  await patch(
    'index.html',
    [
      [preload[0], ''],
      [
        'href="/temple-entry/entry.css"',
        `href="/temple-entry/entry.css?v=${versions['entry.css']}"`,
      ],
      ['src="/temple-entry/entry.mjs"', `src="/temple-entry/entry.mjs?v=${versions['entry.mjs']}"`],
    ],
    entryDependencies,
  );

  for (const output of outputs)
    await writeFile(new URL('site/' + output.target, root), output.text);
  await writeFile(new URL('patches/patches.json', root), JSON.stringify(registry, null, 2) + '\n');
  return verifyAssets(fileURLToPath(root));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await generatePerformance()));
