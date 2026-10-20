import {z} from 'zod';

const sha=z.string().regex(/^[a-f0-9]{64}$/),arm=z.enum(['baseline','candidate']);
export const ma24EvaluationTaskSpecSchema=z.object({schema:z.literal('ma24-evaluation-run-v1'),manifestSha256:sha,
 caseId:z.string().trim().min(1).max(120),arm}).strict();
export const skillCandidateTaskSpecSchema=z.object({schema:z.literal('skill-candidate-task-v1'),freezeId:z.uuid(),planHash:sha,
 caseId:z.string().min(1).max(200),evaluationId:z.uuid(),arm,originalRunId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive(),
 contentHash:sha,snapshotHash:sha,inputHash:sha,sourceHash:sha,identityHash:sha}).strict();
export const evaluationTaskSpecSchema=z.discriminatedUnion('schema',[ma24EvaluationTaskSpecSchema,skillCandidateTaskSpecSchema]);
export type EvaluationTaskSpec=z.infer<typeof evaluationTaskSpecSchema>;
