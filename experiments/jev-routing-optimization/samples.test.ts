import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {validationCaseSchema,validationInput} from '../../src/lib/assistant/main/decision-validation';
it('keeps a new balanced validation set with all production bypass categories',()=>{
  const samples=(JSON.parse(readFileSync('experiments/jev-routing-optimization/validation-cases.json','utf8')) as unknown[]).map(s=>validationCaseSchema.parse(s));
  const old=(JSON.parse(readFileSync('experiments/decision-routing-validation/cases-v2.json','utf8')) as unknown[]).map(s=>validationCaseSchema.parse(s));
  expect(samples).toHaveLength(60);expect(new Set(samples.map(s=>s.id)).size).toBe(60);
  expect(new Set(samples.map(s=>s.request)).size).toBe(60);
  expect(samples.some(s=>old.some(o=>o.request===s.request))).toBe(false);
  expect(samples.filter(s=>!s.guard&&s.expected==='fixed_workflow')).toHaveLength(12);
  expect(samples.filter(s=>!s.guard&&s.expected==='interpreter')).toHaveLength(12);
  expect(samples.filter(s=>!s.guard&&s.expected==='dynamic_agent')).toHaveLength(24);
  for(const sample of samples){const input=validationInput(sample);expect(Boolean(input.state)).toBe(!sample.guard);
    if(sample.guard)expect(input.ruleRoute).toBe(sample.expected);}
});
