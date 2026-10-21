import {z} from 'zod';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const runtimeProcessProofSchema=z.object({protocol:z.literal('local-runtime-process-v1'),
 role:z.enum(['main-agent','skill-collector']),deploymentHash:sha,nodeSha256:sha,
 entry:z.enum(['start.mjs','runner.mjs']),entrySha256:sha,
 artifact:z.enum(['worker.mjs','server.mjs','runner.mjs']),artifactSha256:sha}).strict().superRefine((proof,context)=>{
 if(proof.role==='skill-collector'?(proof.entry!=='runner.mjs'||proof.artifact!=='runner.mjs'||proof.entrySha256!==proof.artifactSha256):
  (proof.entry!=='start.mjs'||!['worker.mjs','server.mjs'].includes(proof.artifact)))
  context.addIssue({code:'custom',message:'Runtime process role and artifacts differ'});
});
