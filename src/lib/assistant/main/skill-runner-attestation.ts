import {createPublicKey,verify} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {digest} from './contracts';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
const keyId=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/);
export const skillRunnerStatementSchema=z.object({
 protocol:z.literal('skill-runner-attestation-v1'),keyId,
 collectorId:z.string().min(1).max(200),deploymentHash:sha,
 ownerId:z.uuid(),freezeId:z.uuid(),planHash:sha,artifactHash:sha,runtimeIdentityHash:sha,
 capturedAt:z.iso.datetime(),completedAt:z.iso.datetime(),issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
}).strict();
export const skillRunnerEnvelopeSchema=z.object({statement:skillRunnerStatementSchema,
 signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
const registrySchema=z.object({protocol:z.literal('skill-runner-trust-registry-v1'),
 keys:z.array(z.object({keyId,collectorId:z.string().min(1).max(200),deploymentHash:sha,
  publicKeyPem:z.string().max(4096).regex(/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\s*$/),
  enabled:z.boolean(),notBefore:z.iso.datetime(),expiresAt:z.iso.datetime(),
  purposes:z.array(z.enum(['runner-declaration','model-transport','task-model-transport'])).min(1).refine(values=>new Set(values).size===values.length).default(['runner-declaration']),
 }).strict()).max(100),
}).strict().superRefine((value,context)=>{
 if(new Set(value.keys.map(key=>key.keyId)).size!==value.keys.length)
  context.addIssue({code:'custom',message:'Runner trust key IDs must be unique'});
});
const expectedSchema=z.object({ownerId:z.uuid(),freezeId:z.uuid(),planHash:sha,
 artifactHash:sha,runtimeIdentityHash:sha,deploymentHash:sha,collectorId:z.string().min(1).max(200),
 frozenAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
 capturedAt:z.iso.datetime(),completedAt:z.iso.datetime(),
}).strict();
export type SkillRunnerBinding=z.infer<typeof expectedSchema>;

/** A signature authenticates an operator-enrolled collector's statement, not the binary
 * or provider by itself. Callers must derive expected bindings from server records and
 * recheck live sources, freeze/reviews and registry state in the final enable transaction.
 * Neither this primitive nor its result grants Skill activation. */
export function verifySkillRunnerAttestation(envelope:unknown,registryInput:unknown,
 expectedInput:SkillRunnerBinding,now:Date=new Date()){
 const registry=registrySchema.parse(registryInput),expected=expectedSchema.parse(expectedInput);
 const signed=skillRunnerEnvelopeSchema.parse(envelope),statement=signed.statement;
 const current=now.getTime();
 if(!Number.isFinite(current))throw new Error('Runner attestation clock invalid');
 const key=registry.keys.find(row=>row.keyId===statement.keyId);
 if(!key?.enabled)throw new Error('Runner attestation trust key unavailable');
 if(!key.purposes.includes('runner-declaration'))throw new Error('Runner attestation key purpose unavailable');
 const frozen=Date.parse(expected.frozenAt),planExpiry=Date.parse(expected.expiresAt);
 const captured=Date.parse(statement.capturedAt),completed=Date.parse(statement.completedAt);
 const issued=Date.parse(statement.issuedAt),expiry=Date.parse(statement.expiresAt);
 const trustedFrom=Date.parse(key.notBefore),trustedUntil=Date.parse(key.expiresAt);
 if(!(trustedFrom<=frozen&&frozen<=captured&&captured<=completed&&completed<=issued&&issued<=current
  &&current<expiry&&expiry<=planExpiry&&expiry<=trustedUntil&&current<trustedUntil))
  throw new Error('Runner attestation time window invalid');
 if(captured!==Date.parse(expected.capturedAt)||completed!==Date.parse(expected.completedAt))
  throw new Error('Runner attestation observation time binding changed');
 for(const field of ['ownerId','freezeId','planHash','artifactHash','runtimeIdentityHash','deploymentHash','collectorId'] as const)
  if(statement[field]!==expected[field])throw new Error('Runner attestation binding changed');
 if(key.collectorId!==statement.collectorId||key.deploymentHash!==statement.deploymentHash)
  throw new Error('Runner attestation enrollment changed');
 const publicKey=createPublicKey(key.publicKeyPem);
 if(publicKey.asymmetricKeyType!=='ed25519')throw new Error('Runner attestation key algorithm invalid');
 const signature=Buffer.from(signed.signature,'base64url');
 if(signature.length!==64||signature.toString('base64url')!==signed.signature
  ||!verify(null,Buffer.from(digest(statement),'hex'),publicKey,signature))
  throw new Error('Runner attestation signature invalid');
 return {signatureVerified:true as const,bindingsVerified:true as const,
  statementHash:digest(statement),registryHash:digest(registry),keyId:key.keyId,
  automaticActivation:false as const};
}

/** Server-configured public registry only; never take a registry/key from HTTP or tool input.
 * Reload on every check so removal/disablement takes effect. No private key is loaded here. */
export async function verifyConfiguredSkillRunnerAttestation(envelope:unknown,expected:SkillRunnerBinding){
 return verifySkillRunnerAttestation(envelope,await loadConfiguredSkillRunnerTrustRegistry(),expected);
}
export async function loadConfiguredSkillRunnerTrustRegistry(){
 const path=process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE;
 if(!path)throw new Error('Runner trust registry is not configured');
 const bytes=await readFile(path);
 if(bytes.length>512_000)throw new Error('Runner trust registry too large');
 return registrySchema.parse(JSON.parse(bytes.toString('utf8')));
}
