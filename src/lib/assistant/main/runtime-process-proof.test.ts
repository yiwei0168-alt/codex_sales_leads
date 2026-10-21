import {expect,it} from 'vitest';
import {readRegisteredRuntimeProcess,runtimeProcessInvocation,runtimeProcessProofSchema} from './runtime-process-proof';

it('distinguishes the collector child entry from the main worker and server entries',()=>{
 expect(runtimeProcessInvocation('skill-collector',['node','/app/runner.mjs','--execute','/job.json'],'file:///app/runner.mjs'))
  .toEqual({entry:'runner.mjs',artifact:'runner.mjs'});
 expect(runtimeProcessInvocation('main-agent',['node','/app/start.mjs','worker','--once'],'file:///app/worker.mjs'))
  .toEqual({entry:'start.mjs',artifact:'worker.mjs'});
 expect(runtimeProcessInvocation('main-agent',['node','/app/start.mjs','server'],'file:///app/server.mjs'))
  .toEqual({entry:'start.mjs',artifact:'server.mjs'});
});
it('does not promote a scratch or source-module invocation into a package claim',async()=>{
 expect(runtimeProcessInvocation('skill-collector',['node','/verification/fixture.mjs','--execute','/job.json'],'file:///app/runner.mjs')).toBeUndefined();
 expect(runtimeProcessInvocation('main-agent',['node','/verification/fixture.mjs'],'file:///app/worker.mjs')).toBeUndefined();
 expect(await readRegisteredRuntimeProcess('skill-collector','a'.repeat(64),import.meta.url)).toBeUndefined();
});
it.each([
 ['skill-collector',['node','/app/runner.mjs','--check','/job.json'],'file:///app/runner.mjs'],
 ['skill-collector',['node','/app/runner.mjs','--execute','/job.json'],'file:///verification/fixture.mjs'],
 ['skill-collector',['node','/app/runner.mjs','--execute','/job.json','extra'],'file:///app/runner.mjs'],
 ['main-agent',['node','/app/start.mjs','mailbox-worker'],'file:///app/worker.mjs'],
 ['main-agent',['node','/app/start.mjs','worker'],'file:///app/server.mjs'],
 ['main-agent',['node','/app/start.mjs','server','--once'],'file:///app/server.mjs'],
 ['main-agent',['node','/app/start.mjs','worker'],'file:///app/worker.mjs?injected=1'],
 ] as const)('rejects mismatched canonical invocation %s %j', (role,argv,url)=>{
 expect(()=>runtimeProcessInvocation(role,argv,url)).toThrow();
});
it('requires strict bound hashes and does not accept qualification assertions',()=>{
 const proof={protocol:'local-runtime-process-v1',role:'skill-collector',deploymentHash:'a'.repeat(64),nodeSha256:'b'.repeat(64),
  entry:'runner.mjs',entrySha256:'c'.repeat(64),artifact:'runner.mjs',artifactSha256:'c'.repeat(64)};
 expect(runtimeProcessProofSchema.parse(proof)).toEqual(proof);
 expect(()=>runtimeProcessProofSchema.parse({...proof,productionAgentEquivalent:true})).toThrow();
 expect(()=>runtimeProcessProofSchema.parse({...proof,nodeSha256:'unknown'})).toThrow();
});
