import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {productNodeBuildOptions} from './product-node-build.mjs';

test('main and collector Node builds execute the same import condition; legacy CJS selects different code',async()=>{
 const base=resolve('tmp');await mkdir(base,{recursive:true});
 const directory=await mkdtemp(join(base,'module-loader-'));
 try{
  const dependency=join(directory,'node_modules','conditional-test');await mkdir(dependency,{recursive:true});
  await writeFile(join(dependency,'package.json'),JSON.stringify({name:'conditional-test',exports:{import:'./import.mjs',require:'./require.cjs'}}));
  await writeFile(join(dependency,'import.mjs'),"export const selected='esm-import';");
  await writeFile(join(dependency,'require.cjs'),"exports.selected='cjs-require';");
  const entry=join(directory,'entry.ts');await writeFile(entry,"import 'server-only'; import {selected} from 'conditional-test'; console.log(selected);");
  const run=path=>execFileSync(process.execPath,[path],{encoding:'utf8',windowsHide:true}).trim();
  for(const name of ['main','collector']){
   const outfile=join(directory,`${name}.mjs`);await build({...productNodeBuildOptions(),entryPoints:[entry],outfile});
   assert.equal(run(outfile),'esm-import');
  }
  const legacy=join(directory,'legacy.cjs');await build({...productNodeBuildOptions(),entryPoints:[entry],outfile:legacy,format:'cjs'});
  assert.equal(run(legacy),'cjs-require');
 }finally{await rm(directory,{recursive:true,force:true});}
});
