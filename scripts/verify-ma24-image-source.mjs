import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [image, revision = 'HEAD'] = process.argv.slice(2);
assert(image && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(image), 'Expected image tag');
assert(/^[a-f0-9]{8,40}$|^HEAD$/.test(revision), 'Expected fixed Git commit or HEAD');
const commit = execFileSync('git', ['rev-parse', revision], { encoding: 'utf8' }).trim();
const temporary = mkdtempSync(join(tmpdir(), 'ma24-image-source-'));

// Identical inventory code executes against a Git archive and inside the image.
const inspect = String.raw`
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[1],files=[];
function walk(relative){
 const directory=fs.lstatSync(path.join(root,relative));
 if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('Source link');
 for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Source link');
  const p=path.posix.join(relative,entry.name);
  if(entry.isDirectory())walk(p);else if(/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name))files.push(p);
 }
}
walk('src');files.push('package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs');
const hashes={};for(const p of files.sort()){
 if(!fs.lstatSync(path.join(root,p)).isFile())throw Error('Non-regular input');
 hashes[p]=crypto.createHash('sha256').update(JSON.stringify(fs.readFileSync(path.join(root,p),'utf8'))).digest('hex');
}
console.log(JSON.stringify({count:files.length,hash:crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex')}));`;
try {
  const archive = execFileSync('git', ['archive', '--format=tar', commit], { maxBuffer: 100 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const expected = JSON.parse(execFileSync(process.execPath, ['-e', inspect, temporary], { encoding: 'utf8' }));
  const actual = JSON.parse(execFileSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image,
    '-e', inspect, '/app/.skill-runtime-source'], { encoding: 'utf8' }));
  assert.deepEqual(actual, expected, 'Image source material differs from fixed Git commit');
  const roots = JSON.parse(execFileSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image,
    '-e', "console.log(JSON.stringify(require('node:fs').readdirSync('/app')))"], { encoding: 'utf8' }));
  for (const name of ['.env', '.env.local', '.env.production', '.git', '.github', 'docs', 'experiments', 'tests', 'AGENTS.md']) {
    assert(!roots.includes(name), `Unexpected release root: ${name}`);
  }
  const imageId = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ imageSourceVerification: 'passed', commit, image, imageId, ...actual,
    roots, binaryAttestation: false, providerAttestation: false }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
