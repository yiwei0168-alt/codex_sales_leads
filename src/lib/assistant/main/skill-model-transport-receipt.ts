import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {digest} from './contracts';
import {modelReplySchema} from './model';
import {modelRequestManifestSchema} from './model-request-manifest';
import {loadConfiguredSkillRunnerTrustRegistry} from './skill-runner-attestation';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillTransportBindingSchema=z.object({ownerId:z.uuid(),freezeId:z.uuid(),evaluationId:z.uuid(),arm:z.enum(['baseline','candidate']),
 planHash:sha,snapshotHash:sha,step:z.number().int().min(0),routeIndex:z.number().int().min(0).max(2),
 collectorId:z.string().min(1).max(200),deploymentHash:sha}).strict();
export const skillTransportStatementSchema=skillTransportBindingSchema.extend({protocol:z.literal('skill-model-transport-v1'),keyId:z.string().min(1).max(100),
 requestHash:sha,manifestHash:sha,responseHash:sha,origin:z.literal('https://openrouter.ai'),path:z.literal('/api/v1/chat/completions'),
 status:z.literal(200),capturedAt:z.iso.datetime(),completedAt:z.iso.datetime(),expiresAt:z.iso.datetime()}).strict();
export const skillTransportEnvelopeSchema=z.object({statement:skillTransportStatementSchema,signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();

/** Tool-call IDs are replaced by the journal adapter. Bind all semantic fields
 * while leaving only those server-generated correlation IDs out of the hash. */
export function skillTransportResponseHash(input:unknown){
 const message=modelReplySchema.parse(input);
 return digest({...message,...(message.tool_calls?{tool_calls:message.tool_calls.map((call,index)=>({...call,id:`call-${index}`}))}:{})});
}
export async function verifyConfiguredSkillTransportReceipt(envelope:unknown,input:{binding:z.infer<typeof skillTransportBindingSchema>;manifest:unknown;message:unknown;frozenAt:string;expiresAt:string},now=new Date()){
 const signed=skillTransportEnvelopeSchema.parse(envelope),s=signed.statement,binding=skillTransportBindingSchema.parse(input.binding);
 const registry=await loadConfiguredSkillRunnerTrustRegistry(binding.ownerId),key=registry.keys.find(row=>row.keyId===s.keyId);
 if(!key?.enabled||!key.purposes.includes('model-transport'))throw new Error('Transport trust key unavailable');
 for(const name of Object.keys(binding) as Array<keyof typeof binding>)if(binding[name]!==s[name])throw new Error('Transport receipt binding changed');
 if(key.collectorId!==s.collectorId||key.deploymentHash!==s.deploymentHash)throw new Error('Transport enrollment changed');
 const captured=Date.parse(s.capturedAt),completed=Date.parse(s.completedAt),expires=Date.parse(s.expiresAt),time=now.getTime();
 if(!Number.isFinite(time)||!(Date.parse(key.notBefore)<=Date.parse(input.frozenAt)&&Date.parse(input.frozenAt)<=captured&&captured<=completed
  &&completed<=time&&time<expires&&expires<=Date.parse(input.expiresAt)&&expires<=Date.parse(key.expiresAt)))throw new Error('Transport receipt time invalid');
 const manifest=modelRequestManifestSchema.parse(input.manifest);
 if(!manifest.response.modelMatchesRequested||!manifest.response.model||!manifest.response.provider||!manifest.response.generationId
  ||s.requestHash!==manifest.requestHash||s.manifestHash!==digest(manifest)||s.responseHash!==skillTransportResponseHash(input.message))
  throw new Error('Transport result binding changed');
 const publicKey=createPublicKey(key.publicKeyPem),signature=Buffer.from(signed.signature,'base64url');
 if(publicKey.asymmetricKeyType!=='ed25519'||signature.length!==64||signature.toString('base64url')!==signed.signature
  ||!verify(null,Buffer.from(digest(s),'hex'),publicKey,signature))throw new Error('Transport signature invalid');
 return {transportSignatureVerified:true as const,validBefore:s.expiresAt,statementHash:digest(s),registryHash:digest(registry),automaticActivation:false as const};
}
