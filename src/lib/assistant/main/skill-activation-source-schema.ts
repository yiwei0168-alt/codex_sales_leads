import {z} from 'zod';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillActivationSourceSchema=z.object({runId:z.uuid(),sourceHash:sha,chainHash:sha,initialSourceHash:sha,
 attachmentHash:sha,knowledgeHash:sha,pinnedMethodsHash:sha,validBefore:z.iso.datetime().nullable()}).strict();
export const skillActivationSourcesSchema=z.array(skillActivationSourceSchema).min(1).max(100)
 .refine(rows=>new Set(rows.map(row=>row.runId)).size===rows.length);
