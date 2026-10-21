import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {digest,type ModelMessage} from './contracts';
import {modelFunctions,modelReplySchema,transportMessages} from './model';
import {modeConfigSchema} from './mode-config';
import {retryableModeFailureReasons} from './mode-failure-reasons';
import {modelRequestManifestSchema,assertModelRequestManifest} from './model-request-manifest';
import {failureStatusMatches} from './skill-model-transport-failure-receipt';
import {taskTransportBindingSchema} from './task-model-transport-receipt';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {runtimeProcessProofSchema} from './runtime-process-proof-schema';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const taskTransportFailureStatementSchema=taskTransportBindingSchema.extend({protocol:z.literal('task-model-transport-failure-v1'),
 keyId:z.string().min(1).max(100),requestHash:sha,manifestHash:sha,reason:z.enum(retryableModeFailureReasons),retryable:z.literal(true),
 httpStatus:z.number().int().min(100).max(599).nullable(),origin:z.literal('https://openrouter.ai'),path:z.literal('/api/v1/chat/completions'),
 capturedAt:z.iso.datetime(),completedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),runtimeProcess:runtimeProcessProofSchema.optional()}).strict();
export const taskTransportFailureEnvelopeSchema=z.object({statement:taskTransportFailureStatementSchema,requestManifest:modelRequestManifestSchema,
 signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
/** Expected request, binding and times must be loaded from the owned journal. */
export async function verifyConfiguredTaskTransportFailure(envelope:unknown,input:{binding:z.infer<typeof taskTransportBindingSchema>;request:unknown;
 reason:string;taskCreatedAt:string;callStartedAt:string;callCompletedAt:string},now=new Date()){
 const signed=taskTransportFailureEnvelopeSchema.parse(envelope),s=signed.statement,m=signed.requestManifest,b=taskTransportBindingSchema.parse(input.binding);
 const request=z.object({messages:z.array(modelReplySchema.extend({role:z.enum(['system','user','assistant','tool']),content:z.string().nullable(),tool_call_id:z.string().optional()})).min(1),
  profile:modeConfigSchema,index:z.number().int().min(0).max(2)}).strict().parse(input.request);
 const route=request.profile.routes[request.index];
 assertModelRequestManifest({...m.settings,messages:transportMessages(request.messages as ModelMessage[]),tools:modelFunctions},m);
 if(!route||digest(input.request)!==b.inputHash||request.index!==Number(b.callKey.split(':').at(-1))||m.requestedModel!==route.model||m.settings.stream!==true
  ||(m.settings.reasoning as {effort?:unknown}|undefined)?.effort!==route.effort||m.toolSchemaHash!==digest(modelFunctions)
  ||m.response.model!==null||m.response.provider!==null||m.response.generationId!==null||m.response.modelMatchesRequested
  ||s.requestHash!==m.requestHash||s.manifestHash!==digest(m)||s.reason!==input.reason||!failureStatusMatches(s.reason,s.httpStatus))
  throw new Error('Task failure request or outcome changed');
 for(const field of Object.keys(b) as Array<keyof typeof b>)if(b[field]!==s[field])throw new Error('Task failure binding changed');
 if(s.runtimeProcess&&(s.runtimeProcess.role!=='main-agent'||s.runtimeProcess.deploymentHash!==s.deploymentHash))throw new Error('Task failure process claim binding changed');
 const registry=await loadConfiguredSkillRunnerTrustRegistry(b.ownerId),key=registry.keys.find(row=>row.keyId===s.keyId);
 if(!key?.enabled||!key.purposes.includes('task-model-transport')||key.collectorId!==s.collectorId||key.deploymentHash!==s.deploymentHash)throw new Error('Task failure trust unavailable');
 const created=Date.parse(z.iso.datetime().parse(input.taskCreatedAt)),started=Date.parse(z.iso.datetime().parse(input.callStartedAt)),finished=Date.parse(z.iso.datetime().parse(input.callCompletedAt));
 const captured=Date.parse(s.capturedAt),completed=Date.parse(s.completedAt),expiry=Date.parse(s.expiresAt),time=now.getTime();
 if(!Number.isFinite(time)||!(Date.parse(key.notBefore)<=captured&&created<=started&&started<=captured&&captured<=completed
  &&completed<=finished&&finished<=time&&time<expiry&&expiry<=Date.parse(key.expiresAt)))throw new Error('Task failure time invalid');
 const publicKey=createPublicKey(key.publicKeyPem),signature=Buffer.from(signed.signature,'base64url');
 if(publicKey.asymmetricKeyType!=='ed25519'||signature.length!==64||signature.toString('base64url')!==signed.signature
  ||!verify(null,Buffer.from(digest(s),'hex'),publicKey,signature))throw new Error('Task failure signature invalid');
 return {taskTransportFailureSignatureVerified:true as const,validBefore:s.expiresAt,statementHash:digest(s),registryHash:digest(registry),keyId:key.keyId,
  ...(s.runtimeProcess?{runtimeProcessClaim:s.runtimeProcess}:{}),
  signingEnrollment:{keyId:key.keyId,collectorId:key.collectorId,deploymentHash:key.deploymentHash,purpose:'task-model-transport' as const},
  completeTaskProvenanceVerified:false as const,automaticActivation:false as const};
}
