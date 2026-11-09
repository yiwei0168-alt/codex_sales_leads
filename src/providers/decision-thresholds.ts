import thresholds from '../../config/agent/decision-thresholds-v2.json';
import type {DecisionResponse} from './decision-contract';

export const LEGACY_DECISION_POLICY_VERSION='hybrid-decision-thresholds-v1';
export const DECISION_POLICY_VERSION=thresholds.version;
export function knownDecisionPolicy(version:string) {
  return version===LEGACY_DECISION_POLICY_VERSION||version===DECISION_POLICY_VERSION;
}
export function meetsDecisionThreshold(response:DecisionResponse,route:'fixed_workflow'|'interpreter',
  threshold:{enabled:boolean;topProbability:number;topTwoMargin:number}) {
  if(!threshold.enabled||response.answers.route.choice!==route
    ||!Number.isFinite(threshold.topProbability)||threshold.topProbability<0.5||threshold.topProbability>1
    ||!Number.isFinite(threshold.topTwoMargin)||threshold.topTwoMargin<0||threshold.topTwoMargin>1)return false;
  const ranked=Object.values(response.answers.route.probabilities).sort((a,b)=>b-a);
  // Decimal wire probabilities can put an exact 0.50-0.45 boundary just below 0.05 in binary.
  const tolerance=Number.EPSILON*8;
  return ranked[0]+tolerance>=threshold.topProbability&&ranked[0]-ranked[1]+tolerance>=threshold.topTwoMargin;
}
/** Threshold tuning changes admission, not the meaning of probability or tool permissions. */
export function acceptedRoute(response:DecisionResponse,policyVersion=DECISION_POLICY_VERSION) {
  if(!knownDecisionPolicy(policyVersion))return 'dynamic_agent';
  const answer=response.answers.route;
  if(answer.choice!=='fixed_workflow'&&answer.choice!=='interpreter')return 'dynamic_agent';
  const model=Object.keys(thresholds.models).find(model=>response.model===model
    ||(response.model.startsWith(`${model}-`)&&/^\d{8}$/.test(response.model.slice(model.length+1))));
  if(!model)return 'dynamic_agent';
  if(policyVersion===LEGACY_DECISION_POLICY_VERSION){
    const ranked=Object.values(answer.probabilities).sort((a,b)=>b-a);
    return ranked[0]>=0.9&&ranked[0]-ranked[1]>=0.2?answer.choice:'dynamic_agent';
  }
  const threshold=thresholds.models[model as keyof typeof thresholds.models][answer.choice];
  return meetsDecisionThreshold(response,answer.choice,threshold)
    ?answer.choice:'dynamic_agent';
}
