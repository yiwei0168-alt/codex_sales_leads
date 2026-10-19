import {z} from 'zod';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const keyId=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/);
export const skillRunnerTrustRegistrySchema=z.object({protocol:z.literal('skill-runner-trust-registry-v1'),
 keys:z.array(z.object({keyId,collectorId:z.string().min(1).max(200),deploymentHash:sha,
  publicKeyPem:z.string().max(4096).regex(/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\s*$/),
  enabled:z.boolean(),notBefore:z.iso.datetime(),expiresAt:z.iso.datetime(),
  purposes:z.array(z.enum(['runner-declaration','model-transport','task-model-transport'])).min(1).refine(values=>new Set(values).size===values.length).default(['runner-declaration']),
 }).strict()).max(100),
}).strict().superRefine((value,context)=>{
 if(new Set(value.keys.map(key=>key.keyId)).size!==value.keys.length)
  context.addIssue({code:'custom',message:'Runner trust key IDs must be unique'});
});
