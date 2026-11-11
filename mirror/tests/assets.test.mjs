import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { applyPatch, verifyAssets } from '../tools/apply-patches.mjs';
const hash = (s) => createHash('sha256').update(s).digest('hex');
test('patch requires exact source version, exactly one match and verified result', () => {
  const patch = {
    beforeSha256: hash('alpha beta'),
    afterSha256: hash('alpha local'),
    before: 'beta',
    after: 'local',
  };
  assert.equal(applyPatch('alpha beta', patch), 'alpha local');
  assert.equal(applyPatch('alpha local', patch), 'alpha local');
  assert.throws(() => applyPatch('different beta', patch), /version/);
  assert.throws(() => applyPatch('alpha beta', { ...patch, before: 'absent' }), /match/);
  assert.throws(() => applyPatch('alpha beta', { ...patch, before: 'a' }), /match/);
  assert.throws(() => applyPatch('alpha beta', { ...patch, afterSha256: hash('wrong') }), /result/);
});
test('registered baseline deletion, tampering and unregistered working changes fail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sansa-assets-'));
  try {
    await mkdir(join(root, 'baseline/site'), { recursive: true });
    await mkdir(join(root, 'site'));
    await mkdir(join(root, 'patches'));
    await writeFile(
      join(root, 'baseline/manifest.json'),
      JSON.stringify({ files: [{ path: 'index.html', bytes: 5, sha256: hash('hello') }] }),
    );
    await writeFile(join(root, 'patches/patches.json'), JSON.stringify({ patches: [] }));
    await writeFile(join(root, 'baseline/site/index.html'), 'hello');
    await writeFile(join(root, 'site/index.html'), 'hello');
    assert.equal((await verifyAssets(root)).files, 1);
    await writeFile(join(root, 'site/index.html'), 'wrong');
    await assert.rejects(verifyAssets(root), /working/);
    await writeFile(join(root, 'site/index.html'), 'hello');
    await writeFile(join(root, 'baseline/site/index.html'), 'wrong');
    await assert.rejects(verifyAssets(root), /baseline/);
    await rm(join(root, 'baseline/site/index.html'));
    await assert.rejects(verifyAssets(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('frozen source and running copy match the audited patch set', async () => {
  const result = await verifyAssets(fileURLToPath(new URL('..', import.meta.url)));
  assert.ok(result.files > 30);
});
