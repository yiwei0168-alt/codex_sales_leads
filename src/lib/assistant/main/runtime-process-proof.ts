import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {z} from 'zod';
import {runtimeProcessProofSchema} from './runtime-process-proof-schema';
export {runtimeProcessProofSchema} from './runtime-process-proof-schema';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
type Role=z.infer<typeof runtimeProcessProofSchema>['role'];
type Proof=z.infer<typeof runtimeProcessProofSchema>;
type Integrity={assertCollectorRuntimeBoundary:(root:string)=>Promise<unknown>;collectorPackageInventory:(root:string)=>Promise<unknown>};
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');

/** Invocation screening only. A matching argv is not an execution proof. */
export function runtimeProcessInvocation(role:Role,argv:readonly string[],artifactUrl:string){
 const entry=role==='skill-collector'?'runner.mjs':'start.mjs';
 if(argv[1]!==`/app/${entry}`)return undefined;
 const artifactLocation=new URL(artifactUrl);
 if(artifactLocation.protocol!=='file:'||artifactLocation.host||artifactLocation.search||artifactLocation.hash)throw new Error('Runtime process artifact URL invalid');
 const artifact=role==='skill-collector'?'runner.mjs':argv[2]==='worker'?'worker.mjs':argv[2]==='server'?'server.mjs':undefined;
 const valid=role==='skill-collector'?argv.length===4&&argv[2]==='--execute':
  artifact&&(argv.length===3||argv.length===4&&argv[2]==='worker'&&argv[3]==='--once');
 if(!valid||!artifact||artifactLocation.pathname!==`/app/${artifact}`)throw new Error('Runtime process invocation unavailable');
 return {entry,artifact} as const;
}

const verified=new Map<string,{proof:Proof;manifest:string;integrity:Integrity}>();
/** Local process/package admission, not hardware/remote-host attestation. Unknown
 * legacy entry points return no claim. A canonical entry with changed bytes or
 * boundary fails, rather than silently falling back to an unqualified claim.
 * The caller must first authenticate deploymentHash against its signing registry. */
export async function readRegisteredRuntimeProcess(role:Role,deploymentHash:string,artifactUrl:string){
 const invocation=runtimeProcessInvocation(role,process.argv,artifactUrl);
 if(!invocation)return undefined;
 sha.parse(deploymentHash);
 const assertInvocation=async()=>{
  if(process.platform!=='linux'||process.env.NODE_ENV!=='production'||process.execArgv.length||process.env.NODE_OPTIONS?.trim()
   ||process.env.NODE_PATH?.trim()||!process.getuid?.())throw new Error('Plain non-root Linux runtime process required');
  const command=(await readFile('/proc/self/cmdline')).toString('utf8').split('\0');
  if(command.at(-1)==='')command.pop();
  if(JSON.stringify(command.slice(1))!==JSON.stringify(process.argv.slice(1))
   ||JSON.stringify(runtimeProcessInvocation(role,process.argv,artifactUrl))!==JSON.stringify(invocation)
   ||await realpath('/proc/self/exe')!==await realpath(process.execPath)
   ||await realpath(`/app/${invocation.entry}`)!==`/app/${invocation.entry}`
   ||await realpath(`/app/${invocation.artifact}`)!==`/app/${invocation.artifact}`)
   throw new Error('Runtime process kernel invocation changed');
 };
 await assertInvocation();
 const key=`${role}:${deploymentHash}:${invocation.entry}:${invocation.artifact}`;
 let saved=verified.get(key);
 if(!saved){
  const manifest=await readFile('/app/runtime-manifest.json','utf8');
  if(manifest.length>32*1024*1024||hash(manifest)!==deploymentHash)throw new Error('Runtime process deployment changed');
  const inventory=JSON.parse(manifest) as {nodeSha256?:unknown;files?:Record<string,{sha256?:unknown}>};
  const fileHash=(path:string)=>sha.parse(inventory.files?.[path]?.sha256);
  // Authenticate this dependency before importing/executing it. The manifest
  // hash was authenticated by the caller's signing enrollment, not by a claim.
  if(hash(await readFile('/app/package-integrity.mjs'))!==fileHash('package-integrity.mjs'))throw new Error('Runtime integrity module changed');
  const modulePath='/app/package-integrity.mjs';
  const integrity=await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ modulePath) as Integrity;
  await integrity.assertCollectorRuntimeBoundary('/app');
  if(JSON.stringify(await integrity.collectorPackageInventory('/app'))!==manifest)throw new Error('Runtime process inventory changed');
  const proof=runtimeProcessProofSchema.parse({protocol:'local-runtime-process-v1',role,deploymentHash,
   nodeSha256:inventory.nodeSha256,entry:invocation.entry,entrySha256:fileHash(invocation.entry),
   artifact:invocation.artifact,artifactSha256:fileHash(invocation.artifact)});
  saved={proof,manifest,integrity};verified.set(key,saved);
 }
 const current=saved;
 const assertCurrent=async()=>{
  await assertInvocation();await current.integrity.assertCollectorRuntimeBoundary('/app');
  const [manifest,node,entry,artifact]=await Promise.all([readFile('/app/runtime-manifest.json','utf8'),readFile(process.execPath),
   readFile(`/app/${current.proof.entry}`),readFile(`/app/${current.proof.artifact}`)]);
  if(manifest!==current.manifest||hash(node)!==current.proof.nodeSha256||hash(entry)!==current.proof.entrySha256
   ||hash(artifact)!==current.proof.artifactSha256)throw new Error('Runtime process admitted bytes changed');
 };
 // Full dependencies are measured once in this process, then retained under the
 // read-only/non-root/no-capability boundary. The trusted host is out of scope.
 await assertCurrent();
 return {proof:structuredClone(current.proof),assertCurrent};
}
