import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {productNodeBuildOptions} from './lib/product-node-build.mjs';

if(process.argv.length!==2)throw new Error('No build arguments accepted');
const directory=resolve('tmp/main-agent-runtime');await mkdir(directory,{recursive:true});
const entries=[['worker','scripts/run-main-agent-worker.ts'],['mailbox-worker','scripts/run-mailbox-worker.ts'],['server','src/lib/assistant/main/server.ts']];
const artifacts={};
for(const [name,entry] of entries){
 const outfile=resolve(directory,`${name}.mjs`);
 const compiled=await build({...productNodeBuildOptions(),entryPoints:[entry],outfile});
 artifacts[name]={sha256:createHash('sha256').update(await readFile(outfile)).digest('hex'),inputs:Object.keys(compiled.metafile.inputs).sort()};
}
await writeFile(resolve(directory,'build-manifest.json'),JSON.stringify({protocol:'main-agent-runtime-build-v1',nodeTarget:24,moduleFormat:'esm',externalPackages:true,artifacts,productionQualified:false},null,2)+'\n');
console.log(JSON.stringify({mainAgentRuntimeBuild:'passed',artifacts,productionQualified:false}));
