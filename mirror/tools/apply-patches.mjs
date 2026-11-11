import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function applyPatch(text, patch) {
  if (hash(text) === patch.afterSha256) return text;
  if (hash(text) !== patch.beforeSha256) throw Error('patch source version mismatch');
  if (!patch.before || text.split(patch.before).length !== 2)
    throw Error('patch must match exactly once');
  const result = text.replace(patch.before, () => patch.after);
  if (hash(result) !== patch.afterSha256) throw Error('patch result hash mismatch');
  return result;
}
async function walk(root, base = root) {
  const files = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isSymbolicLink()) throw Error('symlink not allowed: ' + p);
    if (e.isDirectory()) files.push(...(await walk(p, base)));
    else files.push(relative(base, p));
  }
  return files;
}
export async function verifyAssets(root) {
  const manifest = JSON.parse(await readFile(join(root, 'baseline/manifest.json')));
  const { patches } = JSON.parse(await readFile(join(root, 'patches/patches.json')));
  const registered = new Set(manifest.files.map((f) => f.path));
  for (const scope of ['baseline/site', 'site'])
    for (const file of await walk(join(root, scope)))
      if (!registered.has(file)) throw Error('unregistered ' + scope + ' file: ' + file);
  for (const file of manifest.files) {
    if (!file.path || file.path.includes('..') || file.path.startsWith('/'))
      throw Error('invalid manifest path');
    const raw = await readFile(join(root, 'baseline/site', file.path));
    if (raw.length !== file.bytes || hash(raw) !== file.sha256)
      throw Error('baseline integrity: ' + file.path);
    let expected = raw;
    for (const patch of patches.filter((p) => p.target === file.path))
      expected = Buffer.from(applyPatch(expected.toString('utf8'), patch));
    const actual = await readFile(join(root, 'site', file.path));
    if (!actual.equals(expected))
      throw Error('working copy has unregistered changes: ' + file.path);
  }
  for (const patch of patches)
    if (!registered.has(patch.target)) throw Error('unregistered patch target');
  return { files: manifest.files.length, patches: patches.length };
}
const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--apply')) {
      const { patches } = JSON.parse(await readFile(join(root, 'patches/patches.json')));
      const grouped = Map.groupBy(patches, (p) => p.target);
      for (const [target, list] of grouped) {
        const dest = join(root, 'site', target);
        let text = await readFile(join(root, 'baseline/site', target), 'utf8');
        for (const patch of list) text = applyPatch(text, patch);
        await writeFile(dest, text);
      }
    }
    console.log(JSON.stringify(await verifyAssets(root)));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
