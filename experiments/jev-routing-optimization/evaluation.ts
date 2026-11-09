import {atomicRoute,routeStrength,VERSION,type AtomicPolicy,type AtomicResponse,type FastRoute,type Threshold} from './contract';
import type {ValidationCase} from '../../src/lib/assistant/main/decision-validation';
export const GRID={probabilities:[0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95],
  margins:[0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5],minimumPositives:12,minimumNegatives:24,
  objective:'zero wrong admissions; maximize correct admissions; tie-break higher probability then margin'};
export const GATES={minimumAvailability:0.95,minimumFixedCoverage:0.5,minimumInterpreterCoverage:0.5,
  minimumFixedGain:0.25,maximumUnsafeSuggestions:0,maximumGuardViolations:0,maximumP95Ms:2000,
  noInterpreterCoverageRegression:true,productionActivation:false};
export type DevRow={sample:ValidationCase;response:AtomicResponse};
export function selectPolicy(rows:DevRow[]):AtomicPolicy {
  if(rows.length!==48||new Set(rows.map(r=>r.sample.id)).size!==48||rows.some(r=>r.sample.guard))throw Error('Incomplete development data');
  const routes={} as Record<FastRoute,Threshold>;
  for(const route of ['fixed_workflow','interpreter'] as const){
    if(rows.filter(r=>r.sample.expected===route).length<GRID.minimumPositives
      ||rows.filter(r=>r.sample.expected!==route).length<GRID.minimumNegatives)throw Error('Insufficient support');
    const candidates=GRID.probabilities.flatMap(probability=>GRID.margins.map(margin=>{
      const admitted=rows.filter(r=>{const strength=routeStrength(r.response,route);return strength
        &&strength.probability+Number.EPSILON*8>=probability&&strength.margin+Number.EPSILON*8>=margin;});
      return {enabled:true,probability,margin,correct:admitted.filter(r=>r.sample.expected===route).length,
        wrong:admitted.filter(r=>r.sample.expected!==route).length};
    })).filter(r=>r.wrong===0&&r.correct>=2).sort((a,b)=>b.correct-a.correct||b.probability-a.probability||b.margin-a.margin);
    const best=candidates[0];routes[route]=best?{enabled:true,probability:best.probability,margin:best.margin}
      :{enabled:false,probability:0.95,margin:0.5};
  }
  return {version:'jev-atomic-policy-v1',contractVersion:VERSION,routes};
}
export function developmentStats(rows:DevRow[],policy:AtomicPolicy){
  return (['fixed_workflow','interpreter'] as const).map(route=>({route,
    correct:rows.filter(r=>r.sample.expected===route&&atomicRoute(r.response,policy)===route).length,
    wrong:rows.filter(r=>r.sample.expected!==route&&atomicRoute(r.response,policy)===route).length}));
}
