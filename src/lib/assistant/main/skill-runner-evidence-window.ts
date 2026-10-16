import {z} from 'zod';
import {digest} from './contracts';
import {skillAcceptanceObservationSchema,skillAcceptancePlanSchema} from './skill-acceptance-policy';

/** Derive claim times from immutable observations, never from signer-supplied dates.
 * Partial group bundles are allowed; complete quality review is a separate gate. */
export function skillRunnerEvidenceWindow(planInput:unknown,observationsInput:unknown){
 const plan=skillAcceptancePlanSchema.parse(planInput);
 const observations=z.array(skillAcceptanceObservationSchema).min(1).max(1000).parse(observationsInput);
 const cases=new Map(plan.cases.map(item=>[item.id,item])),seen=new Set<string>();
 const planHash=digest(plan),frozen=Date.parse(plan.frozenAt),expiry=Date.parse(plan.expiresAt);
 let first=Infinity,last=-Infinity;
 for(const observation of observations){
  const item=cases.get(observation.caseId);
  if(!item||seen.has(observation.caseId)||observation.planHash!==planHash||digest(observation.pin)!==digest(plan.pin)
   ||observation.inputHash!==item.inputHash||observation.sourceHash!==item.sourceHash||observation.provenance!==item.provenance)
   throw new Error('Runner observation binding changed');
  seen.add(observation.caseId);
  const captured=Date.parse(observation.capturedAt),completed=Date.parse(observation.completedAt);
  if(captured<frozen||completed<captured||completed>=expiry)throw new Error('Runner observation time window invalid');
  if(item.category==='shadow'&&(observation.taskStartedAt===null||Date.parse(observation.taskStartedAt)<captured||Date.parse(observation.taskStartedAt)>completed))
   throw new Error('Runner observation prospective time invalid');
  first=Math.min(first,captured);last=Math.max(last,completed);
 }
 return {capturedAt:new Date(first).toISOString(),completedAt:new Date(last).toISOString()};
}
