import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {build} from 'esbuild';

const [image]=process.argv.slice(2);
assert(process.argv.length===3&&/^sha256:[a-f0-9]{64}$/.test(image??''),'One immutable local Linux image required');
const root=resolve('tmp');await mkdir(root,{recursive:true});
const directory=await mkdtemp(join(root,'ma24-process-proof-'));
const within=relative(root,directory);assert(within&&!within.startsWith('..')&&!isAbsolute(within));
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const results:Array<{case:string;admission:string}>=[];
const docker=(args:string[])=>{
 const out=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
 if(out.error)throw out.error;return out;
};
const boundary=['run','--rm','--network','none','--user','1000:1000','--cap-drop=ALL','--security-opt=no-new-privileges'];
try{
 const packages=new Map<string,{path:string;manifest:string;deploymentHash:string;args:string[]}>();
 for(const kind of ['collector','worker','server']){
  const path=join(directory,kind);await mkdir(path);
  const artifact=kind==='collector'?'runner.mjs':`${kind}.mjs`,role=kind==='collector'?'skill-collector':'main-agent';
  const contents=`import {readRegisteredRuntimeProcess} from ${JSON.stringify(resolve('src/lib/assistant/main/runtime-process-proof.ts'))};
   if(process.env.MA24_COMPONENT_MODE==='spoof-argv')process.argv[3]='/changed-job.json';
   try { const admitted=await readRegisteredRuntimeProcess(${JSON.stringify(role)},process.env.MA24_COMPONENT_DEPLOYMENT_HASH,import.meta.url);
    await admitted?.assertCurrent();
    console.log(JSON.stringify({runtimeProcessAdmission:admitted?'admitted':'legacy-unclaimed',syntheticPackage:true,
     registeredProductionPackage:false,productionAgentEquivalent:false,automaticActivation:false,modelCalls:0}));
   } catch {console.log(JSON.stringify({runtimeProcessAdmission:'rejected',syntheticPackage:true,registeredProductionPackage:false}));process.exitCode=1;}`;
  await build({stdin:{contents,resolveDir:process.cwd(),sourcefile:'process-proof-component.ts',loader:'ts'},
   outfile:join(path,artifact),bundle:true,packages:'bundle',platform:'node',target:'node24',format:'esm',logLevel:'silent'});
  if(kind!=='collector')await writeFile(join(path,'start.mjs'),`await import('./${artifact}');\n`);
  await copyFile('scripts/skill-collector-package.mjs',join(path,'package-integrity.mjs'));
  const setup=docker(['run','--rm','--network','none','--user','0:0','--mount',`type=bind,source=${path},target=/app`,
   '--entrypoint','node',image,'--input-type=module','-e',
   "import {writeFile} from 'node:fs/promises';import {collectorPackageInventory} from '/app/package-integrity.mjs';await writeFile('/app/runtime-manifest.json',JSON.stringify(await collectorPackageInventory('/app')));"]);
  assert.equal(setup.status,0,'Synthetic manifest setup failed');
  const manifest=await readFile(join(path,'runtime-manifest.json'),'utf8');
  packages.set(kind,{path,manifest,deploymentHash:sha(manifest),args:kind==='collector'?['/app/runner.mjs','--execute','/job.json']:['/app/start.mjs',kind]});
 }
 const check=(name:string,kind:string,expected:string,options:{writableRoot?:boolean;extra?:string[];args?:string[];deploymentHash?:string}={})=>{
  const pkg=packages.get(kind)!;
  const out=docker([...boundary,...(!options.writableRoot?['--read-only']:[]),'--mount',`type=bind,source=${pkg.path},target=/app,readonly`,
   '--env',`MA24_COMPONENT_DEPLOYMENT_HASH=${options.deploymentHash??pkg.deploymentHash}`,...(options.extra??[]),
   '--entrypoint','node',image,...(options.args??pkg.args)]);
  const result=JSON.parse(out.stdout.trim());assert.equal(result.runtimeProcessAdmission,expected,name);
  assert.equal(out.status,expected==='rejected'?1:0,name);assert.equal(result.registeredProductionPackage,false);
  results.push({case:name,admission:result.runtimeProcessAdmission});
 };
 for(const kind of ['collector','worker','server'])check(`${kind}-canonical-entry`,kind,'admitted');
 const collector=packages.get('collector')!;
 check('scratch-entry-never-promoted','collector','legacy-unclaimed',{
  extra:['--mount',`type=bind,source=${collector.path},target=/verification,readonly`],args:['/verification/runner.mjs','--execute','/job.json']});
 check('argv-spoof-rejected-by-kernel-command','collector','rejected',{extra:['--env','MA24_COMPONENT_MODE=spoof-argv']});
 check('writable-root-rejected','collector','rejected',{writableRoot:true});
 check('node-options-rejected','collector','rejected',{extra:['--env','NODE_OPTIONS=--enable-source-maps']});
 check('wrong-deployment-rejected','collector','rejected',{deploymentHash:'0'.repeat(64)});
 const changed=JSON.parse(collector.manifest);changed.files['runner.mjs'].sha256='0'.repeat(64);
 const changedBytes=JSON.stringify(changed);await writeFile(join(collector.path,'runtime-manifest.json'),changedBytes);
 check('inventory-tamper-rejected','collector','rejected',{deploymentHash:sha(changedBytes)});
 console.log(JSON.stringify({runtimeProcessLinuxComponent:'passed',imageId:image,cases:results,
  usesCurrentGuardSource:true,syntheticPackage:true,registeredProductionPackage:false,firstProviderExecutionVerified:false,
  productionAgentEquivalent:false,automaticActivation:false,modelCalls:0}));
}finally{
 // directory was resolved and checked under the workspace tmp root above.
 await rm(directory,{recursive:true,force:true});
}
