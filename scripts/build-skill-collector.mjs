import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';

if(process.argv.length!==2)throw new Error('No build arguments accepted');
const directory=resolve('tmp/skill-collector'),output=resolve(directory,'runner.cjs');
await mkdir(directory,{recursive:true});
const result=await build({entryPoints:['scripts/skill-collector-runner.ts'],outfile:output,bundle:true,platform:'node',target:'node24',
 format:'cjs',packages:'external',metafile:true,logLevel:'warning'});
const bytes=await readFile(output),sha256=createHash('sha256').update(bytes).digest('hex');
await writeFile(resolve(directory,'build-manifest.json'),JSON.stringify({protocol:'skill-collector-build-v1',sha256,
 nodeTarget:24,inputs:Object.keys(result.metafile.inputs).sort(),externalPackages:true,productionQualified:false},null,2));
console.log(JSON.stringify({collectorBuild:'passed',output:relative(process.cwd(),output),sha256,productionQualified:false}));
