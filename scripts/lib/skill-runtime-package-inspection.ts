import {execFileSync} from 'node:child_process';
import {skillRuntimePackageInspectionSchema} from '../../src/lib/assistant/main/skill-runtime-package-schema';
import {measureSkillRuntimeDependencies} from '../../src/lib/assistant/main/skill-runtime-dependencies';

// Mirrors skill-local-source-runtime-v1. This measures a local immutable Docker
// image; it does not attest a remote host, provider or business answer quality.
const measurement=`const measureDependencies=${measureSkillRuntimeDependencies.toString()};\n`+String.raw`
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';return JSON.stringify(v)??'null';}
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),digest=v=>sha(canonical(v)),root='/app/.skill-runtime-source',files=[];
function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Source link');const p=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name))files.push(p);}}
walk('src');files.push('package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs');files.sort();
const hashes={};for(const p of files)hashes[p]=digest(fs.readFileSync(path.join(root,p),'utf8'));
const bytes=fs.readFileSync('/app/runtime-manifest.json'),manifest=JSON.parse(bytes);
console.log(JSON.stringify({runtimeHash:digest({protocol:'skill-local-source-runtime-v1',node:process.versions.node,platform:process.platform,arch:process.arch,files:hashes}),
sourceInputs:files.length,node:process.versions.node,platform:process.platform,arch:process.arch,nodeSha256:sha(fs.readFileSync(process.execPath)),
deploymentHash:sha(bytes),files:Object.keys(manifest.files).length,...measureDependencies(manifest.files,digest)}));`;

export function inspectSkillRuntimePackage(imageId:string,role:'main-agent'|'skill-collector'){
 if(!/^sha256:[a-f0-9]{64}$/.test(imageId))throw new Error('Runtime registration requires an immutable Docker image ID');
 if(!['main-agent','skill-collector'].includes(role))throw new Error('Runtime package role invalid');
 const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:120_000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim();
 const metadata=JSON.parse(docker(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',imageId]));
 if(metadata.id!==imageId||typeof metadata.revision!=='string'||!/^[a-f0-9]{40}$/.test(metadata.revision))throw new Error('Fixed runtime image revision unavailable');
 const boundary=['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop=ALL','--security-opt','no-new-privileges=true'];
 const checked=JSON.parse(docker([...boundary,imageId,'--verify']));
 const field=role==='main-agent'?'mainAgentRuntimeIntegrity':'collectorPackageIntegrity';
 if(checked[field]!=='passed'||checked.productionQualified!==false||['runtimeBoundaryVerified','processNonRoot','noNewPrivileges','capabilitiesEmpty','rootReadOnly','packageAndNodeReadOnly'].some(key=>checked[key]!==true))
  throw new Error('Runtime package boundary inspection failed');
 const measured=JSON.parse(docker([...boundary,'--entrypoint','node',imageId,'-e',measurement]));
 if(checked.deploymentHash!==measured.deploymentHash||checked.files!==measured.files)throw new Error('Independent runtime inventory differs');
 const variable=role==='main-agent'?'TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256':'SKILL_RUNNER_DEPLOYMENT_SHA256';
 const enrolled=JSON.parse(docker([...boundary,'--env',`${variable}=${measured.deploymentHash}`,imageId,'--verify']));
 const flag=role==='main-agent'?'taskTransportPackageBindingVerified':'deploymentEnrollmentVerified';
 if(enrolled[field]!=='passed'||enrolled[flag]!==true||enrolled.deploymentHash!==measured.deploymentHash)throw new Error('Runtime signing deployment binding inspection failed');
 return skillRuntimePackageInspectionSchema.parse({role,imageId,sourceCommit:metadata.revision,...measured});
}
