import { describe, expect, it } from 'vitest';
import { structuredUserPrompt } from './structured-user-prompt';
import type { StructuredAiRequest } from './contracts';

describe('stable structured prefix', () => {
  const request: StructuredAiRequest<unknown> = {task:'lead-qualification',modelVersion:'test',promptVersion:'test',
    evidenceIds:['b','a'],input:{instructions:['first','second'],market:{country:'MX'},
      candidates:[{id:'z'},{id:'a'}],scoringRubric:{weights:{fit:50}},privateMemory:['private']}};
  it('preserves all values and arrays without mutating source', () => {
    const before=JSON.stringify(request);const output=JSON.parse(structuredUserPrompt(request));
    expect(output).toEqual({task:request.task,promptVersion:request.promptVersion,input:request.input,evidenceIds:request.evidenceIds});
    expect(JSON.stringify(request)).toBe(before);
    expect(Object.keys(output.input).slice(0,2)).toEqual(['instructions','scoringRubric']);
    expect(Object.keys(output)).toEqual(['task','promptVersion','input','evidenceIds']);
  });
  it('places fixed rules before changing evidence IDs and candidates', () => {
    const a=structuredUserPrompt(request);
    const b=structuredUserPrompt({...request,evidenceIds:['new']});
    expect(a.slice(0,a.indexOf('"evidenceIds"'))).toBe(b.slice(0,b.indexOf('"evidenceIds"')));
    expect(a.indexOf('"scoringRubric"')).toBeLessThan(a.indexOf('"market"'));
  });
  it('leaves unrelated tasks in their previous order', () => {
    const r={...request,task:'contact-verification' as const};
    expect(structuredUserPrompt(r)).toBe(JSON.stringify({task:r.task,promptVersion:r.promptVersion,evidenceIds:r.evidenceIds,input:r.input}));
  });
});
