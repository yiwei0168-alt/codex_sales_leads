import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {digest,type ModelMessage} from './contracts';
import {modelFunctions,modelReplySchema,transportMessages} from './model';
import {modeConfigSchema} from './mode-config';
import {retryableModeFailureReasons} from './mode-failure-reasons';
import {modelRequestManifestSchema,assertModelRequestManifest} from './model-request-manifest';
import {skillTransportBindingSchema} from './skill-model-transport-receipt';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {runtimeProcessProofSchema} from './runtime-process-proof-schema';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillTransportFailureStatementSchema=skillTransportBindingSchema.extend({protocol:z.literal('skill-model-transport-failure-v1'),
 keyId:z.string().min(1).max(100),requestHash:sha,manifestHash:sha,reason:z.enum(retryableModeFailureReasons),retryable:z.literal(true),
 httpStatus:z.number().int().min(100).max(599).nullable(),origin:z.literal('https://openrouter.ai'),path:z.literal('/api/v1/chat/completions'),
 capturedAt:z.iso.datetime(),completedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),runtimeProcess:runtimeProcessProofSchema.optional()}).strict();
export const skillTransportFailureEnvelopeSchema=z.object({statement:skillTransportFailureStatementSchema,requestManifest:modelRequestManifestSchema,
 signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
export function failureStatusMatches(reason:string,status:number|null){
 if(reason.startsWith('http-'))return reason===`http-${status}`;
 if(reason==='connection-failed')return status===null;
 return reason.startsWith('timeout-')&&(status===null||status===200);
}
export async function verifyConfiguredSkillTransportFailure(envelope:unknown,input:{binding:z.infer<typeof skillTransportBindingSchema>;request:unknown;
 reason:string;frozenAt:string;expiresAt:string;toolSchemaHash:string},now=new Date()){
 const signed=skillTransportFailureEnvelopeSchema.parse(envelope),s=signed.statement,m=signed.requestManifest,b=skillTransportBindingSchema.parse(input.binding);
 const request=z.object({messages:z.array(modelReplySchema.extend({role:z.enum(['system','user','assistant','tool']),content:z.string().nullable(),tool_call_id:z.string().optional()})).min(1),
  profile:modeConfigSchema,index:z.number().int().min(0).max(2)}).strict().parse(input.request);
 const route=request.profile.routes[request.index];
 assertModelRequestManifest({...m.settings,messages:transportMessages(request.messages as ModelMessage[]),tools:modelFunctions},m);
 if(!route||request.index!==b.routeIndex||m.requestedModel!==route.model||m.settings.stream!==true
  ||(m.settings.reasoning as {effort?:unknown}|undefined)?.effort!==route.effort||m.toolSchemaHash!==input.toolSchemaHash
  ||m.response.model!==null||m.response.provider!==null||m.response.generationId!==null||m.response.modelMatchesRequested
  ||s.requestHash!==m.requestHash||s.manifestHash!==digest(m)||s.reason!==input.reason||!failureStatusMatches(s.reason,s.httpStatus))
  throw new Error('Transport failure request or outcome changed');
 for(const key of Object.keys(b) as Array<keyof typeof b>)if(b[key]!==s[key])throw new Error('Transport failure binding changed');
 if(s.runtimeProcess&&(s.runtimeProcess.role!=='skill-collector'||s.runtimeProcess.deploymentHash!==s.deploymentHash))throw new Error('Transport failure process claim binding changed');
 const registry=await loadConfiguredSkillRunnerTrustRegistry(b.ownerId),key=registry.keys.find(row=>row.keyId===s.keyId);
 if(!key?.enabled||!key.purposes.includes('model-transport')||key.collectorId!==s.collectorId||key.deploymentHash!==s.deploymentHash)throw new Error('Transport failure trust unavailable');
 if(!(Date.parse(key.notBefore)<=Date.parse(input.frozenAt)&&Date.parse(input.frozenAt)<=Date.parse(s.capturedAt)
  &&Date.parse(s.capturedAt)<=Date.parse(s.completedAt)&&Date.parse(s.completedAt)<=now.getTime()&&now.getTime()<Date.parse(s.expiresAt)
  &&Date.parse(s.expiresAt)<=Date.parse(key.expiresAt)&&Date.parse(s.expiresAt)<=Date.parse(input.expiresAt)))throw new Error('Transport failure time invalid');
 const publicKey=createPublicKey(key.publicKeyPem),signature=Buffer.from(signed.signature,'base64url');
 if(publicKey.asymmetricKeyType!=='ed25519'||signature.toString('base64url')!==signed.signature||!verify(null,Buffer.from(digest(s),'hex'),publicKey,signature))throw new Error('Transport failure signature invalid');
 return {validBefore:s.expiresAt,statementHash:digest(s),registryHash:digest(registry),
  ...(s.runtimeProcess?{runtimeProcessClaim:s.runtimeProcess}:{}),
  signingEnrollment:{keyId:key.keyId,collectorId:key.collectorId,deploymentHash:key.deploymentHash,purpose:'model-transport' as const},automaticActivation:false as const};
}
