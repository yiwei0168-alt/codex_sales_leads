import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {digest} from './contracts';
import {modelRequestManifestSchema} from './model-request-manifest';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';
import {skillTransportResponseHash} from './skill-model-transport-receipt';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const taskTransportBindingSchema=z.object({ownerId:z.uuid(),runId:z.uuid(),callId:z.uuid(),
 callKey:z.string().max(120).regex(/^mode-model:\d+:\d+:[012]$/),inputHash:sha,
 collectorId:z.string().min(1).max(200),deploymentHash:sha}).strict();
export const taskTransportStatementSchema=taskTransportBindingSchema.extend({
 protocol:z.literal('task-model-transport-v1'),keyId:z.string().min(1).max(100),
 requestHash:sha,manifestHash:sha,responseHash:sha,origin:z.literal('https://openrouter.ai'),
 path:z.literal('/api/v1/chat/completions'),status:z.literal(200),
 capturedAt:z.iso.datetime(),completedAt:z.iso.datetime(),expiresAt:z.iso.datetime()}).strict();
export const taskTransportEnvelopeSchema=z.object({statement:taskTransportStatementSchema,
 signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();

/** Original task requests precede evaluation freezes. Expected values must come
 * from the owned durable task/call, not a caller-selected claim. This verifies a
 * signed successful transport only; it does not qualify a complete fallback
 * chain, runtime binary, quality decision, or Skill activation. */
export async function verifyConfiguredTaskTransportReceipt(envelope:unknown,input:{
 binding:z.infer<typeof taskTransportBindingSchema>;manifest:unknown;message:unknown;taskCreatedAt:string;callStartedAt:string;callCompletedAt:string},now=new Date()){
 const signed=taskTransportEnvelopeSchema.parse(envelope),s=signed.statement,binding=taskTransportBindingSchema.parse(input.binding);
 const created=Date.parse(z.iso.datetime().parse(input.taskCreatedAt));
 const started=Date.parse(z.iso.datetime().parse(input.callStartedAt)),finished=Date.parse(z.iso.datetime().parse(input.callCompletedAt));
 const registry=await loadConfiguredSkillRunnerTrustRegistry(),key=registry.keys.find(row=>row.keyId===s.keyId);
 if(!key?.enabled||!key.purposes.includes('task-model-transport'))throw new Error('Task transport trust key unavailable');
 for(const field of Object.keys(binding) as Array<keyof typeof binding>)if(s[field]!==binding[field])throw new Error('Task transport binding changed');
 if(key.collectorId!==binding.collectorId||key.deploymentHash!==binding.deploymentHash)throw new Error('Task transport enrollment changed');
 const captured=Date.parse(s.capturedAt),completed=Date.parse(s.completedAt),expiry=Date.parse(s.expiresAt),time=now.getTime();
 if(!Number.isFinite(time)||!(Date.parse(key.notBefore)<=captured&&created<=started&&started<=captured&&captured<=completed
  &&completed<=finished&&finished<=time&&time<expiry&&expiry<=Date.parse(key.expiresAt)))throw new Error('Task transport time invalid');
 const manifest=modelRequestManifestSchema.parse(input.manifest);
 if(!manifest.response.modelMatchesRequested||!manifest.response.model||!manifest.response.provider||!manifest.response.generationId
  ||s.requestHash!==manifest.requestHash||s.manifestHash!==digest(manifest)||s.responseHash!==skillTransportResponseHash(input.message))
  throw new Error('Task transport result binding changed');
 const publicKey=createPublicKey(key.publicKeyPem),signature=Buffer.from(signed.signature,'base64url');
 if(publicKey.asymmetricKeyType!=='ed25519'||signature.length!==64||signature.toString('base64url')!==signed.signature
  ||!verify(null,Buffer.from(digest(s),'hex'),publicKey,signature))throw new Error('Task transport signature invalid');
 return {taskTransportSignatureVerified:true as const,statementHash:digest(s),registryHash:digest(registry),keyId:key.keyId,
  completeTaskProvenanceVerified:false as const,automaticActivation:false as const};
}
