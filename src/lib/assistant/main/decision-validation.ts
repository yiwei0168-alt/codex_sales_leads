import {z} from 'zod';
import type {ModelMessage} from './contracts';
import {decisionState} from './decision-routing';
import {hybridFirstAction} from './hybrid-routing';
import {acceptedRoute,routeNameSchema,type DecisionResponse} from '@/providers/decision-contract';
import {DECISION_POLICY_VERSION} from '@/providers/decision-thresholds';

export const validationCaseSchema=z.object({id:z.string().regex(/^[FIDG]\d{2}$/),expected:routeNameSchema,
  request:z.string().min(1),guard:z.enum(['history','attachments','policy','scope','oversized','instructions','deterministic']).optional()}).strict();
export type ValidationCase=z.infer<typeof validationCaseSchema>;
export function validationInput(sample:ValidationCase) {
  const restricted=['history','attachments','scope'].includes(sample.guard??'');
  const messages:ModelMessage[]=[{role:'system',content:restricted?'[hybrid-v1]':'[hybrid-v1:eligible]'}];
  if(sample.guard==='history')messages.push({role:'user',content:'Earlier synthetic request'},{role:'assistant',content:'Earlier synthetic answer'});
  messages.push({role:'user',content:sample.guard==='oversized'?sample.request+'条件'.repeat(3100):sample.request});
  if(sample.guard==='instructions')messages.push({role:'user',content:'Additional synthetic instruction'});
  const state=decisionState(messages,sample.guard==='policy');
  return {messages,state,ruleRoute:hybridFirstAction(messages)?'fixed_workflow' as const:'dynamic_agent' as const};
}
export type ValidationOutcome={id:string;status:'completed'|'guarded'|'failed-or-unknown';
  appliedRoute:string;latencyMs:number|null;response?:DecisionResponse};
/** Risk and coverage gates are declared before inference; they are not user-specified percentages. */
export const VALIDATION_GATES={version:'frozen-v2-unseen-synthetic-v1',minimumAvailability:0.95,
  minimumFixedCoverage:0.5,minimumInterpreterCoverage:0.5,maximumUnsafeSuggestions:0,
  maximumGuardViolations:0,productionActivation:false};
export function summarizeValidation(cases:ValidationCase[],outcomes:ValidationOutcome[]) {
  if(new Set(cases.map(s=>s.id)).size!==cases.length||new Set(outcomes.map(s=>s.id)).size!==outcomes.length
    ||outcomes.some(o=>!cases.some(s=>s.id===o.id)))throw new Error('Invalid validation identity');
  const eligible=cases.filter(s=>!s.guard),guarded=cases.filter(s=>s.guard);
  const known=new Map(outcomes.map(o=>[o.id,o]));
  const completed=eligible.filter(s=>known.get(s.id)?.status==='completed');
  const unsafe=eligible.filter(s=>{const row=known.get(s.id);return row?.status==='completed'
    &&['fixed_workflow','interpreter'].includes(row.appliedRoute)&&row.appliedRoute!==s.expected;});
  const guardViolations=guarded.filter(s=>{const row=known.get(s.id);return row&&
    (row.status!=='guarded'||row.appliedRoute!==s.expected);});
  const coverage=(route:string)=>{const expected=eligible.filter(s=>s.expected===route);
    const matched=expected.filter(s=>known.get(s.id)?.status==='completed'&&known.get(s.id)?.appliedRoute===route);
    return {expected:expected.length,matched:matched.length,ratio:expected.length?matched.length/expected.length:0};};
  const fixed=coverage('fixed_workflow'),interpreter=coverage('interpreter');
  const availability=eligible.length?completed.length/eligible.length:0;
  const latencies=completed.map(s=>known.get(s.id)!.latencyMs).filter((n):n is number=>typeof n==='number').sort((a,b)=>a-b);
  const allRecorded=cases.every(s=>known.has(s.id));
  return {total:cases.length,eligible:eligible.length,completed:completed.length,guarded:outcomes.filter(o=>o.status==='guarded').length,
    allRecorded,availability,fixed,interpreter,unsafeIds:unsafe.map(s=>s.id),guardViolationIds:guardViolations.map(s=>s.id),
    p95Ms:latencies.length?latencies[Math.ceil(latencies.length*0.95)-1]:null,
    gatePassed:allRecorded&&availability>=VALIDATION_GATES.minimumAvailability&&unsafe.length===0&&guardViolations.length===0
      &&fixed.ratio>=VALIDATION_GATES.minimumFixedCoverage&&interpreter.ratio>=VALIDATION_GATES.minimumInterpreterCoverage,
    independentBusinessAcceptance:false,policyVersion:DECISION_POLICY_VERSION};
}
export function validatedOutcome(id:string,response:DecisionResponse,latencyMs:number):ValidationOutcome {
  return {id,response,latencyMs,status:'completed',appliedRoute:acceptedRoute(response,DECISION_POLICY_VERSION)};
}
