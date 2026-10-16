import {generateKeyPairSync,sign} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modelRequestManifest} from './model-request-manifest';
import {skillTransportResponseHash} from './skill-model-transport-receipt';
import {verifyConfiguredTaskTransportReceipt} from './task-model-transport-receipt';
const state=vi.hoisted(()=>({registry:undefined as unknown}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:async()=>state.registry}));
const pair=generateKeyPairSync('ed25519'),otherId='00000000-0000-4000-8000-000000000009';
const binding={ownerId:'00000000-0000-4000-8000-000000000001',runId:'00000000-0000-4000-8000-000000000002',
 callId:'00000000-0000-4000-8000-000000000003',callKey:'mode-model:0:0:0',inputHash:digest('stored input'),collectorId:'synthetic-web',deploymentHash:digest('deployment')};
const message={role:'assistant' as const,content:'Synthetic original answer'};
const manifest=modelRequestManifest({model:'fixture/model',messages:[{role:'user',content:'Synthetic question'}],tools:[]},
 {model:'fixture/model',provider:'synthetic',id:'synthetic-generation'});
const now=new Date('2026-10-17T02:00:00.000Z');
const input={binding,manifest,message,taskCreatedAt:'2026-10-17T00:00:00.000Z',callStartedAt:'2026-10-17T00:00:30.000Z',callCompletedAt:'2026-10-17T00:03:00.000Z'};
function fixture(){
 const key={keyId:'original-task',collectorId:binding.collectorId,deploymentHash:binding.deploymentHash,
  enabled:true,purposes:['task-model-transport'],publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),
  notBefore:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-18T00:00:00.000Z'};
 state.registry={protocol:'skill-runner-trust-registry-v1',keys:[key]};
 const statement={...binding,protocol:'task-model-transport-v1',keyId:key.keyId,requestHash:manifest.requestHash,
  manifestHash:digest(manifest),responseHash:skillTransportResponseHash(message),origin:'https://openrouter.ai',path:'/api/v1/chat/completions',
  status:200,capturedAt:'2026-10-17T00:01:00.000Z',completedAt:'2026-10-17T00:02:00.000Z',expiresAt:key.expiresAt};
 return {key,statement,envelope:{statement,signature:sign(null,Buffer.from(digest(statement),'hex'),pair.privateKey).toString('base64url')}};
}
it('verifies an original-task signature without claiming frozen evaluation or activation',async()=>{
 const {envelope}=fixture();expect(await verifyConfiguredTaskTransportReceipt(envelope,input,now)).toMatchObject({
  taskTransportSignatureVerified:true,completeTaskProvenanceVerified:false,automaticActivation:false});
});
it.each(['ownerId','runId','callId','callKey','inputHash','collectorId','deploymentHash'] as const)('rejects changed %s',async field=>{
 const {envelope}=fixture(),changed=field.endsWith('Id')&&field!=='collectorId'?otherId:field==='callKey'?'mode-model:1:0:0':field==='collectorId'?'other':digest('changed');
 await expect(verifyConfiguredTaskTransportReceipt(envelope,{...input,binding:{...binding,[field]:changed}},now)).rejects.toThrow('binding');
});
it.each(['runner-declaration','model-transport'])('rejects a key enrolled only for %s',async purpose=>{
 const {key,envelope}=fixture();key.purposes=[purpose];await expect(verifyConfiguredTaskTransportReceipt(envelope,input,now)).rejects.toThrow('trust key');
});
it('rejects altered answers, manifests, signatures and unsigned historical rows',async()=>{
 const {envelope}=fixture();
 await expect(verifyConfiguredTaskTransportReceipt(envelope,{...input,message:{...message,content:'changed'}},now)).rejects.toThrow('result binding');
 await expect(verifyConfiguredTaskTransportReceipt(envelope,{...input,manifest:{...manifest,requestHash:digest('changed')}},now)).rejects.toThrow('result binding');
 await expect(verifyConfiguredTaskTransportReceipt({...envelope,signature:'A'.repeat(86)},input,now)).rejects.toThrow('signature');
 await expect(verifyConfiguredTaskTransportReceipt(undefined,input,now)).rejects.toThrow();
});
it('rejects revocation, expired trust and capture before task creation',async()=>{
 const {key,envelope}=fixture();key.enabled=false;
 await expect(verifyConfiguredTaskTransportReceipt(envelope,input,now)).rejects.toThrow('trust key');key.enabled=true;
 await expect(verifyConfiguredTaskTransportReceipt(envelope,input,new Date('2026-10-19T00:00:00.000Z'))).rejects.toThrow('time');
 await expect(verifyConfiguredTaskTransportReceipt(envelope,{...input,taskCreatedAt:'2026-10-17T01:00:00.000Z'},now)).rejects.toThrow('time');
 await expect(verifyConfiguredTaskTransportReceipt(envelope,{...input,callCompletedAt:'2026-10-17T00:01:30.000Z'},now)).rejects.toThrow('time');
});
