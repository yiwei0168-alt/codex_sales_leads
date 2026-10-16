import {generateKeyPairSync,sign} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {modelRequestManifest} from './model-request-manifest';
import {skillTransportResponseHash,verifyConfiguredSkillTransportReceipt} from './skill-model-transport-receipt';

const state=vi.hoisted(()=>({registry:undefined as unknown}));
vi.mock('./skill-runner-attestation',()=>({loadConfiguredSkillRunnerTrustRegistry:async()=>state.registry}));
const pair=generateKeyPairSync('ed25519');
const binding={ownerId:'11111111-1111-4111-8111-111111111111',freezeId:'22222222-2222-4222-8222-222222222222',
 evaluationId:'33333333-3333-4333-8333-333333333333',arm:'candidate' as const,planHash:digest('plan'),snapshotHash:digest('snapshot'),
 step:0,routeIndex:0,collectorId:'collector',deploymentHash:digest('deployment')};
const message={role:'assistant' as const,content:'Answer',tool_calls:[{id:'provider-id',type:'function' as const,function:{name:'search',arguments:'{"q":"example"}'}}]};
const manifest=modelRequestManifest({model:'example/model',messages:[{role:'user',content:'Question'}],tools:[]},
 {model:'example/model',provider:'fixture-provider',id:'fixture-generation'});
const input={binding,manifest,message,frozenAt:'2026-10-16T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z'};
const now=new Date('2026-10-16T01:00:00.000Z');
function fixture(){
 const key={keyId:'transport',collectorId:binding.collectorId,deploymentHash:binding.deploymentHash,
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,purposes:['model-transport'],
  notBefore:'2026-10-15T00:00:00.000Z',expiresAt:input.expiresAt};
 state.registry={protocol:'skill-runner-trust-registry-v1',keys:[key]};
 const statement={...binding,protocol:'skill-model-transport-v1',keyId:key.keyId,requestHash:manifest.requestHash,
  manifestHash:digest(manifest),responseHash:skillTransportResponseHash(message),origin:'https://openrouter.ai',
  path:'/api/v1/chat/completions',status:200,capturedAt:'2026-10-16T00:01:00.000Z',completedAt:'2026-10-16T00:02:00.000Z',expiresAt:input.expiresAt};
 return {key,envelope:{statement,signature:sign(null,Buffer.from(digest(statement),'hex'),pair.privateKey).toString('base64url')}};
}
afterEach(()=>vi.restoreAllMocks());
it('verifies a signed semantic response while allowing journal call ID replacement',async()=>{
 const {envelope}=fixture();
 expect(await verifyConfiguredSkillTransportReceipt(envelope,{...input,message:{...message,tool_calls:message.tool_calls.map(c=>({...c,id:'journal-id'}))}},now))
  .toMatchObject({transportSignatureVerified:true,automaticActivation:false});
});
it.each(['ownerId','freezeId','evaluationId','planHash','snapshotHash','collectorId','deploymentHash','step','routeIndex','arm'] as const)
 ('rejects a different %s binding',async field=>{
  const {envelope}=fixture();
  const value=field==='step'||field==='routeIndex'?1:field==='arm'?'baseline':field.endsWith('Id')&&field!=='collectorId'?'44444444-4444-4444-8444-444444444444':digest('other');
  await expect(verifyConfiguredSkillTransportReceipt(envelope,{...input,binding:{...binding,[field]:value}},now)).rejects.toThrow('binding');
 });
it('rejects response text, tool arguments and request manifest changes',async()=>{
 const {envelope}=fixture();
 for(const changed of [{...message,content:'Different'},{...message,tool_calls:[{...message.tool_calls[0],function:{name:'search',arguments:'{}'}}]}])
  await expect(verifyConfiguredSkillTransportReceipt(envelope,{...input,message:changed},now)).rejects.toThrow('result binding');
 await expect(verifyConfiguredSkillTransportReceipt(envelope,{...input,manifest:{...manifest,requestHash:digest('other')}},now)).rejects.toThrow('result binding');
});
it('rejects revoked, wrong-purpose and expired enrollment',async()=>{
 for(const change of [{enabled:false},{purposes:['runner-declaration']},{expiresAt:'2026-10-16T00:30:00.000Z'}]){
  const {key,envelope}=fixture();Object.assign(key,change);
  await expect(verifyConfiguredSkillTransportReceipt(envelope,input,now)).rejects.toThrow();
 }
});
it('rejects forged signatures and expired receipts',async()=>{
 const {envelope}=fixture();
 const other=generateKeyPairSync('ed25519');
 await expect(verifyConfiguredSkillTransportReceipt({...envelope,signature:sign(null,Buffer.from(digest(envelope.statement),'hex'),other.privateKey).toString('base64url')},input,now)).rejects.toThrow('signature');
 await expect(verifyConfiguredSkillTransportReceipt(envelope,input,new Date(input.expiresAt))).rejects.toThrow('time');
});
