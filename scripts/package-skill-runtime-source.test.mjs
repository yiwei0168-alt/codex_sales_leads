import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageSkillRuntimeSource } from './package-skill-runtime-source.mjs';

test('standalone receives exact hash inputs without replacing its package or copying private data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-source-'));
  try {
    await mkdir(join(root, 'src/nested'), { recursive: true });
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'standalone'));
    const files = ['src/nested/code.ts', 'src/schema.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'scripts/patch-node-user.cjs'];
    for (const path of files) await writeFile(join(root, path), `original:${path}`);
    await writeFile(join(root, '.env'), 'private');
    await writeFile(join(root, 'src/nested/private.pem'), 'private');
    await writeFile(join(root, 'standalone/package.json'), 'standalone package');
    const copied = await packageSkillRuntimeSource(root, join(root, 'standalone'));
    assert.deepEqual(copied.sort(), files.sort());
    for (const path of files) assert.equal(await readFile(join(root, 'standalone/.skill-runtime-source', path), 'utf8'), `original:${path}`);
    assert.equal(await readFile(join(root, 'standalone/package.json'), 'utf8'), 'standalone package');
    await assert.rejects(readFile(join(root, 'standalone/.skill-runtime-source/.env')));
    await assert.rejects(packageSkillRuntimeSource(root, join(root, 'standalone')), { code: 'EEXIST' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
