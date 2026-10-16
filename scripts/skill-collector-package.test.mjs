import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectorPackageInventory} from './skill-collector-package.mjs';

test('inventory binds runtime bytes, extra dependency files and the Node executable',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'collector-package-'));
 try{
  await mkdir(join(directory,'node_modules'));await writeFile(join(directory,'runner.cjs'),'original');
  const before=await collectorPackageInventory(directory);assert.match(before.nodeSha256,/^[a-f0-9]{64}$/);
  await writeFile(join(directory,'runtime-manifest.json'),JSON.stringify(before));
  assert.deepEqual(await collectorPackageInventory(directory),before);
  await writeFile(join(directory,'runner.cjs'),'changed');assert.notDeepEqual(await collectorPackageInventory(directory),before);
  await writeFile(join(directory,'runner.cjs'),'original');
  await writeFile(join(directory,'node_modules','unexpected.js'),'injection');assert.notDeepEqual(await collectorPackageInventory(directory),before);
 }finally{await rm(directory,{recursive:true,force:true});}
});
