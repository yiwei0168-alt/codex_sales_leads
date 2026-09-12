import type { StructuredAiRequest } from './contracts';

/** Reorder keys only; keep message authority, arrays, values and privacy scope unchanged. */
export function structuredUserPrompt(request: StructuredAiRequest<unknown>): string {
  const original = { task: request.task, promptVersion: request.promptVersion,
    evidenceIds: request.evidenceIds, input: request.input };
  if (!['lead-qualification', 'lead-evidence-correction'].includes(request.task)
    || !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
    return JSON.stringify(original);
  }
  const input = request.input as Record<string, unknown>;
  const keys = ['instructions', 'scoringRubric'];
  const reordered = Object.fromEntries([
    ...keys.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]),
    ...Object.entries(input).filter(([key]) => !keys.includes(key)),
  ]);
  return JSON.stringify({ task: request.task, promptVersion: request.promptVersion,
    input: reordered, evidenceIds: request.evidenceIds });
}
