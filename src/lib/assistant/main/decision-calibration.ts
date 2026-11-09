import type {DecisionResponse, RouteState} from '@/providers/decision-contract';
import {meetsDecisionThreshold} from '@/providers/decision-thresholds';

export type FastRoute = 'fixed_workflow'|'interpreter';
export type Threshold = {enabled:boolean;topProbability:number;topTwoMargin:number};
export type CalibrationRow = {id:string;family:string;split:'development'|'holdout';
  expected:'fixed_workflow'|'interpreter'|'dynamic_agent'|'uncertain';state:RouteState;response:DecisionResponse};
export const CALIBRATION_METHOD = {
  version:'development-zero-observed-error-grid-v1',
  probabilities:[0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95],
  margins:[0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5],
  minimumPositiveRows:8,minimumPositiveFamilies:2,minimumNegativeRows:16,
  maximumObservedWrongAdmissions:0,
  objective:'Maximize correct development admissions; tie-break higher probability, then higher margin.',
} as const;

export function routingContextEligible(state:RouteState) {
  return !state.hasHistory&&!state.hasAttachments&&!state.hasPolicy&&!state.hasKnowledgeScope;
}
export function passesThreshold(response:DecisionResponse,route:FastRoute,threshold:Threshold) {
  return meetsDecisionThreshold(response,route,threshold);
}
export function thresholdStats(rows:CalibrationRow[],route:FastRoute,threshold:Threshold) {
  const admitted=rows.filter(row=>routingContextEligible(row.state)&&passesThreshold(row.response,route,threshold));
  const correct=admitted.filter(row=>row.expected===route);
  return {admitted:admitted.length,correct:correct.length,wrong:admitted.length-correct.length,
    correctFamilies:[...new Set(correct.map(row=>row.family))].sort()};
}

/** Development rows only. The caller cannot tune against the previously exposed holdout. */
export function calibrateThreshold(rows:CalibrationRow[],route:FastRoute) {
  if(!rows.length||rows.some(row=>row.split!=='development'))throw new Error('Calibration requires development-only rows');
  if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Duplicate calibration identity');
  const eligible=rows.filter(row=>routingContextEligible(row.state));
  const positives=eligible.filter(row=>row.expected===route),negatives=eligible.filter(row=>row.expected!==route);
  const support={positives:positives.length,positiveFamilies:new Set(positives.map(row=>row.family)).size,negatives:negatives.length};
  const fallback:Threshold={enabled:false,topProbability:0.9,topTwoMargin:0.2};
  if(support.positives<CALIBRATION_METHOD.minimumPositiveRows||support.positiveFamilies<CALIBRATION_METHOD.minimumPositiveFamilies
    ||support.negatives<CALIBRATION_METHOD.minimumNegativeRows)return {threshold:fallback,support,reason:'insufficient-support',grid:[]};
  const grid=CALIBRATION_METHOD.probabilities.flatMap(topProbability=>CALIBRATION_METHOD.margins.map(topTwoMargin=>{
    const threshold={enabled:true,topProbability,topTwoMargin};
    return {threshold,...thresholdStats(rows,route,threshold)};
  }));
  const candidates=grid.filter(item=>item.wrong===0&&item.correctFamilies.length>=CALIBRATION_METHOD.minimumPositiveFamilies)
    .sort((a,b)=>b.correct-a.correct||b.threshold.topProbability-a.threshold.topProbability||b.threshold.topTwoMargin-a.threshold.topTwoMargin);
  return {threshold:candidates[0]?.threshold??fallback,support,
    reason:candidates.length?'development-candidate-not-business-validated':'no-supported-zero-error-candidate',grid};
}
