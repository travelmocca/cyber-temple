import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { applyPatch, hash } from './apply-patches.mjs';
import { generatePerformance } from './generate-performance.mjs';

const root = new URL('../', import.meta.url);
export async function generateDog() {
  const registry = JSON.parse(await readFile(new URL('patches/patches.json', root)));
  registry.patches = registry.patches.filter(
    (patch) => !patch.id.startsWith('temple-dog-') && !patch.id.startsWith('performance-'),
  );
  const source = JSON.parse(await readFile(new URL('entry/dog/source.json', root)));
  const dependencies = {};
  for (const path of ['entry/dog.mjs', 'entry/dog/source.json', 'entry/dog/' + source.file])
    dependencies[path] = hash(await readFile(new URL(path, root)));
  const version = dependencies['entry/dog.mjs'].slice(0, 12);
  const replacements = [
    [
      'import{_ as xv}from"./index-qXYao_lF.js";',
      `import{_ as xv}from"./index-qXYao_lF.js";import{createTempleDog}from"/temple-entry/dog.mjs?v=${version}";`,
    ],
    [
      'const j1=new Set([Te,Ye,mt,ee]);return{assets:Ca',
      'const templeDog=createTempleDog({Group:Mt,Box3:fn,Vector3:R,AnimationMixer:oT,GLTFLoader:u1,Mesh:ot,PlaneGeometry:oi,MeshBasicMaterial:Wn,DataTexture:gi},{scene:i,isWalkable:(x,z,r)=>!Ea(x,z,r),groundHeight:(x,z)=>Ht.groundY+$t(x,z)+.035});const j1=new Set([Te,Ye,mt,ee]);return{templeDog,assets:Ca',
    ],
    [
      'update(Y,ge,$e=!1,tt){const dt=!tt||tt.intersectsSphere(W_)',
      'update(Y,ge,$e=!1,tt){templeDog.update(ge);const dt=!tt||tt.intersectsSphere(W_)',
    ],
    [
      'kh?.dispose(),Rh?.dispose(),u?.dispose(),Jn.dispose()',
      'templeDog.dispose(),kh?.dispose(),Rh?.dispose(),u?.dispose(),Jn.dispose()',
    ],
    [
      '佛画资料 · 参考阿弥陀三尊的传统图像，由 AI 生成的山寺原创图片。</p>',
      '佛画资料 · 参考阿弥陀三尊的传统图像，由 AI 生成的山寺原创图片。</p><p class="artwork-credit">庭院柴犬 · <a href="https://quaternius.com/packs/ultimateanimatedanimals.html" target="_blank" rel="noopener noreferrer">Quaternius · Ultimate Animated Animal Pack</a>，CC0。已适配尺寸、材质与庭院散步动作。</p>',
    ],
  ];
  const target = 'assets/game-U0Pmc8tU.js';
  let before = await readFile(new URL('baseline/site/' + target, root), 'utf8');
  for (const patch of registry.patches.filter((patch) => patch.target === target))
    before = applyPatch(before, patch);
  const edits = replacements
    .map(([from, to]) => {
      if (before.split(from).length !== 2) throw new Error('Dog patch must match once: ' + from);
      const start = before.indexOf(from);
      return { start, end: start + from.length, before: from, after: to };
    })
    .sort((a, b) => a.start - b.start);
  let after = before;
  for (const edit of [...edits].reverse())
    after = after.slice(0, edit.start) + edit.after + after.slice(edit.end);
  const patch = {
    id: 'temple-dog-' + target.replaceAll('/', '-'),
    target,
    beforeSha256: hash(before),
    afterSha256: hash(after),
    dependencies,
    edits,
    reason:
      'Load one CC0 animated courtyard dog using the existing Three.js runtime; independent local patrol, lifecycle cleanup and source credit',
  };
  registry.patches.push(patch);
  await writeFile(new URL('site/' + target, root), applyPatch(before, patch));
  await writeFile(new URL('patches/patches.json', root), JSON.stringify(registry, null, 2) + '\n');
  return generatePerformance();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await generateDog()));
