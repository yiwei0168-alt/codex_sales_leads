import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Preserve the logical source paths used by skill-local-source-runtime-v1.
// This is source material for hashing, never a binary/provider attestation.
export async function packageSkillRuntimeSource(root, standalone) {
  const target = resolve(standalone, '.skill-runtime-source');
  // Refuse reuse: stale files would silently change the runtime fingerprint.
  await mkdir(target);
  const files = [];
  async function walk(relative) {
    const directory = await lstat(join(root, relative));
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Skill runtime source links are not allowed');
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Skill runtime source links are not allowed');
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name)) files.push(path);
    }
  }
  await walk('src');
  files.push('package.json', 'package-lock.json', 'tsconfig.json', 'scripts/patch-node-user.cjs');
  for (const relative of files.sort()) {
    const source = join(root, relative);
    if (!(await lstat(source)).isFile()) throw new Error('Skill runtime source must be a regular file');
    await mkdir(dirname(join(target, relative)), { recursive: true });
    await copyFile(source, join(target, relative));
  }
  return files.map(path => path.replaceAll('\\', '/'));
}
