import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, symlink, writeFile} from 'node:fs/promises';
import {isAbsolute, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build, version as esbuildVersion} from 'esbuild';

// Build only. Never edits the active runtime configuration or executes a worker.
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const requested = process.argv[2] ?? 'HEAD';
if (process.argv.length > 3 || !/^(?:HEAD|[a-f0-9]{8,40})$/.test(requested)) {
  throw Error('Usage: node scripts/build-local-node-candidate.mjs [HEAD|commit]');
}
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const commit = git(['rev-parse', '--verify', `${requested}^{commit}`]);
if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('A fixed source commit is required');
if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Node 24 required');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const base = resolve(root, '.local-runtime/node-candidates');
await mkdir(base, {recursive: true});
const candidate = await mkdtemp(resolve(base, commit.slice(0, 8) + '-'));
const source = resolve(candidate, 'source');
const artifacts = resolve(candidate, 'artifacts');
await mkdir(source);
await mkdir(artifacts);
const archive = resolve(candidate, 'source.tar');
execFileSync('git', ['archive', '--format=tar', commit, '-o', archive], {cwd: root});
execFileSync('tar', ['-xf', archive, '-C', source], {cwd: root});
// Reuse installed dependencies without copying credentials or local environment.
// This is recorded as a limitation, not claimed as an isolated npm-ci release.
await symlink(resolve(root, 'node_modules'), resolve(source, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir');
const {productNodeBuildOptions} = await import(pathToFileURL(resolve(source, 'scripts/lib/product-node-build.mjs')).href);
const entries = [
  ['business-main-server', 'src/lib/assistant/main/server.ts'],
  ['business-legacy-server', 'src/langgraph/server.ts'],
  ['business-worker', 'scripts/run-main-agent-worker.ts'],
  ['mailbox-worker', 'scripts/run-mailbox-worker.ts'],
  ['lead-worker', 'scripts/run-lead-workflow-worker.ts'],
];
const manifest = {
  protocol: 'local-node-candidate-v1', sourceCommit: commit,
  sourceArchiveSha256: hash(await readFile(archive)),
  lockfileSha256: hash(await readFile(resolve(source, 'package-lock.json'))),
  builderSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  nodeVersion: process.version, esbuildVersion,
  externalPackages: true, dependencyInstallVerified: false,
  webIncluded: false, activated: false, productionQualified: false,
  artifacts: {},
};
for (const [name, entry] of entries) {
  const outfile = resolve(artifacts, name + '.mjs');
  const compiled = await build({
    ...productNodeBuildOptions(), absWorkingDir: source,
    // Resolve the server marker from this archive's dependency junction.
    alias: {'server-only': resolve(source, 'node_modules/next/dist/compiled/server-only/empty.js')},
    entryPoints: [resolve(source, entry)], outfile,
  });
  execFileSync(process.execPath, ['--check', outfile], {cwd: source, stdio: 'pipe'});
  const inputs = [];
  for (const input of Object.keys(compiled.metafile.inputs).sort()) {
    const absolute = resolve(source, input);
    let path = relative(source, absolute).replaceAll('\\', '/');
    if (isAbsolute(path) || path.startsWith('../')) {
      const dependencyPath = relative(resolve(root, 'node_modules'), absolute).replaceAll('\\', '/');
      if (isAbsolute(dependencyPath) || dependencyPath.startsWith('../')) {
        throw Error('Input escaped archived source and installed dependencies');
      }
      path = 'node_modules/' + dependencyPath;
    }
    inputs.push({path, sha256: hash(await readFile(absolute)),
      origin: path.startsWith('node_modules/') ? 'installed-dependency' : 'committed-archive'});
  }
  manifest.artifacts[name] = {entry, sha256: hash(await readFile(outfile)), syntaxChecked: true, inputs};
  console.log(JSON.stringify({built: name, inputCount: inputs.length, syntaxChecked: true}));
}
await writeFile(resolve(candidate, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({candidate: relative(root, candidate).replaceAll('\\', '/'),
  sourceCommit: commit, artifactCount: entries.length, activated: false,
  productionQualified: false, manifestSha256: hash(await readFile(resolve(candidate, 'manifest.json')))}));
