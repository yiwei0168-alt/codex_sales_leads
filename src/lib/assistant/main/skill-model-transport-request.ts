import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {getOpenRouterConfig} from '@/providers/openrouter';
import {currentSpendContext} from '@/lib/billing/context';
import {modelRoutedTransport} from '@/lib/network/model-transport';
import {digest} from './contracts';
import {requestModeModel} from './model';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {skillTransportBindingSchema,skillTransportResponseHash,skillTransportStatementSchema,verifyConfiguredSkillTransportReceipt} from './skill-model-transport-receipt';
import type {SkillCandidateCollector,SkillCandidateRequest} from './skill-candidate-model';

const nativeTransport=fetch;
function assertControlledProcess(){
 if(process.env.NODE_ENV!=='production'||process.execArgv.length||process.env.NODE_OPTIONS?.trim()
  ||process.env.NODE_EXTRA_CA_CERTS||process.env.SSL_CERT_FILE||process.env.SSL_CERT_DIR||process.env.NODE_USE_SYSTEM_CA==='1'
  ||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Controlled production collector process required');
}
/** Dedicated enrolled collector only. No caller-supplied transport or key; normal
 * requestModeModel paid-call admission still applies. This is not binary attestation. */
export async function createConfiguredSkillTransportRequest(context:{userId:string},input:{evaluationId:string;arm:'baseline'|'candidate';snapshotHash:string;frozen:NonNullable<SkillCandidateCollector['frozen']>}):Promise<SkillCandidateRequest>{
 assertLocalAnalysisBoundary();
 assertControlledProcess();
 const spendBinding=()=>{
  const scope=currentSpendContext();
  if(!scope||scope.userId!==context.userId||!z.uuid().safeParse(scope.operationId).success||!scope.stage.trim())
   throw new Error('Transport collector requires an owned paid-call scope');
  return digest(scope);
 };
 const spendHash=spendBinding();
 const requireSpend=()=>{if(spendBinding()!==spendHash)throw new Error('Transport paid-call scope changed');};
 const {frozen}=input;await requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan);
 if(frozen.plan.pin.ownerId!==context.userId)throw new Error('Transport collector owner changed');
 const route=new URL(getOpenRouterConfig().baseUrl);
 if(route.origin!=='https://openrouter.ai'||route.pathname!=='/api/v1'||route.search||route.hash||route.username||route.password)
  throw new Error('Transport collector requires the enrolled HTTPS origin');
 const keyId=z.string().min(1).max(100).parse(process.env.SKILL_MODEL_TRANSPORT_KEY_ID),path=process.env.SKILL_MODEL_TRANSPORT_PRIVATE_KEY_FILE;
 if(!path)throw new Error('Transport signing key is not configured');
 const bytes=await readFile(/*turbopackIgnore: true*/ path);if(bytes.length>16384)throw new Error('Transport signing key too large');
 const privateKey=createPrivateKey(bytes);if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('Transport signing algorithm invalid');
 const publicKey=createPublicKey(privateKey).export({type:'spki',format:'der'});
 const binding=skillTransportBindingSchema.omit({step:true,routeIndex:true}).parse({ownerId:context.userId,freezeId:frozen.freezeId,
  evaluationId:input.evaluationId,arm:input.arm,planHash:digest(frozen.plan),snapshotHash:input.snapshotHash,
  collectorId:process.env.SKILL_RUNNER_COLLECTOR_ID,deploymentHash:process.env.SKILL_RUNNER_DEPLOYMENT_SHA256});
 const trust=async()=>{
  const registry=await loadConfiguredSkillRunnerTrustRegistry(),key=registry.keys.find(row=>row.keyId===keyId);
  if(!key?.enabled||!key.purposes.includes('model-transport')||key.collectorId!==binding.collectorId||key.deploymentHash!==binding.deploymentHash
   ||!createPublicKey(key.publicKeyPem).export({type:'spki',format:'der'}).equals(publicKey))throw new Error('Transport signing enrollment unavailable');
  const now=Date.now();if(!(Date.parse(key.notBefore)<=Date.parse(frozen.plan.frozenAt)&&now<Date.parse(key.expiresAt)&&now<Date.parse(frozen.plan.expiresAt)))throw new Error('Transport signing enrollment expired');
  return {registryHash:digest(registry),expiresAt:new Date(Math.min(Date.parse(key.expiresAt),Date.parse(frozen.plan.expiresAt))).toISOString()};
 };
 await trust();
 return async request=>{
  requireSpend();
  assertLocalAnalysisBoundary();await requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan);const before=await trust();
  assertControlledProcess();
  let observedHash:string|undefined,observedStatus:number|undefined,observed=false;const capturedAt=new Date().toISOString();
  const transport:typeof fetch=async(url,init)=>{
   requireSpend();
   assertControlledProcess();
   const target=new URL(url instanceof Request?url.url:String(url));
   if(observed||target.href!=='https://openrouter.ai/api/v1/chat/completions'||init?.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string')throw new Error('Transport request boundary changed');
   observed=true;observedHash=digest(JSON.parse(init.body));
   const response=await modelRoutedTransport(nativeTransport,url,init)(url,init);
   observedStatus=response.status;
   if(response.redirected||response.url!==target.href)throw new Error('Transport response origin changed');
   return response;
  };
  const output=await requestModeModel(request.messages,request.profile,request.index,transport,request.signal);
  requireSpend();
  assertControlledProcess();
  await requireSkillAcceptanceFreeze(context,frozen.freezeId,frozen.plan);const after=await trust();
  if(after.registryHash!==before.registryHash||!observed||observedStatus!==200||observedHash!==output.requestManifest.requestHash
   ||output.requestManifest.toolSchemaHash!==frozen.plan.identity.toolSchemaHash)throw new Error('Transport request or trust changed during call');
  const statement=skillTransportStatementSchema.parse({...binding,protocol:'skill-model-transport-v1',keyId,step:request.step,routeIndex:request.index,
   requestHash:observedHash,manifestHash:digest(output.requestManifest),responseHash:skillTransportResponseHash(output.message),origin:'https://openrouter.ai',
   path:'/api/v1/chat/completions',status:200,capturedAt,completedAt:new Date().toISOString(),expiresAt:after.expiresAt});
  const envelope={statement,signature:sign(null,Buffer.from(digest(statement),'hex'),privateKey).toString('base64url')};
  await verifyConfiguredSkillTransportReceipt(envelope,{binding:{...binding,step:request.step,routeIndex:request.index},manifest:output.requestManifest,
   message:output.message,frozenAt:frozen.plan.frozenAt,expiresAt:frozen.plan.expiresAt});
  return {...output,transportReceipt:envelope};
 };
}
