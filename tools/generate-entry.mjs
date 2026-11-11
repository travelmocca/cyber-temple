import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { applyPatch, hash } from './apply-patches.mjs';
import { generatePerformance } from './generate-performance.mjs';

const root = new URL('../', import.meta.url);
const replacements = [
  {
    target: 'index.html',
    before: '<script type="module" crossorigin src="/assets/index-qXYao_lF.js"></script>',
    after:
      '<link rel="stylesheet" href="/temple-entry/entry.css">\n  <script type="module" src="/temple-entry/entry.mjs"></script>',
  },
  {
    target: 'assets/game-U0Pmc8tU.js',
    before: '.sign(["山寺"],0,',
    after: '.sign([globalThis.__templeEntry?.plaqueName??"山寺"],0,',
  },
];

export async function generateEntry() {
  const registry = JSON.parse(await readFile(new URL('patches/patches.json', root), 'utf8'));
  registry.patches = registry.patches.filter(
    (p) => !p.id.startsWith('temple-entry-') && !p.id.startsWith('performance-'),
  );
  const outputs = [];
  for (const replacement of replacements) {
    let source = await readFile(new URL('baseline/site/' + replacement.target, root), 'utf8');
    for (const patch of registry.patches.filter((p) => p.target === replacement.target))
      source = applyPatch(source, patch);
    if (source.split(replacement.before).length !== 2)
      throw new Error('Entry patch must match once: ' + replacement.target);
    const result = source.replace(replacement.before, () => replacement.after);
    const patch = {
      id: 'temple-entry-' + replacement.target.replaceAll('/', '-'),
      target: replacement.target,
      beforeSha256: hash(source),
      afterSha256: hash(result),
      before: replacement.before,
      after: replacement.after,
      reason:
        'Independent wish-selection entrance and local gate plaque name only; activity and room rules unchanged',
    };
    registry.patches.push(patch);
    outputs.push({ target: replacement.target, text: applyPatch(source, patch) });
  }
  for (const output of outputs)
    await writeFile(new URL('site/' + output.target, root), output.text);
  await writeFile(new URL('patches/patches.json', root), JSON.stringify(registry, null, 2) + '\n');
  return generatePerformance();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await generateEntry()));
