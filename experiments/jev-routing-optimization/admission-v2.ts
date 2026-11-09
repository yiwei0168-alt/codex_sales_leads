import {z} from 'zod';
import {VERSION,atomicRoute,type AtomicResponse,type FastRoute,type AtomicPolicy} from './contract';
import fixedBaseline from './policy-v1.json';
const boundary=z.object({probability:z.number().min(0.5).max(1),margin:z.number().min(0.05).max(1)}).strict();
export const policySchema=z.object({version:z.literal('jev-atomic-admission-v2'),contractVersion:z.literal(VERSION),
  fixedWorkflow:z.literal('atomic-v1-preserved'),
  interpreter:z.object({enabled:z.boolean(),planning:boundary,fit:boundary}).strict()}).strict();
export type PolicyV2=z.infer<typeof policySchema>;
export function strength(answer:AtomicResponse['answers']['fixed_fit']){
  const sorted=Object.values(answer.probabilities).sort((a,b)=>b-a);
  return {probability:sorted[0],margin:sorted[0]-sorted[1]};
}
function passes(answer:AtomicResponse['answers']['fixed_fit'],boundary:{probability:number;margin:number}){
  const s=strength(answer);return s.probability+Number.EPSILON*8>=boundary.probability&&s.margin+Number.EPSILON*8>=boundary.margin;
}
export function routeV2(response:AtomicResponse,policy:PolicyV2){
  if(!policySchema.safeParse(policy).success)return 'dynamic_agent';
  if(atomicRoute(response,fixedBaseline as AtomicPolicy)==='fixed_workflow')return 'fixed_workflow';
  const a=response.answers;
  if(a.requires_planning.choice!=='no')return 'dynamic_agent';
  {
    const fit=a.batch_fit,other=a.fixed_fit;
    const rule=policy.interpreter;
    // The opposite classification must still say no, but cannot veto solely for low probability.
    if(rule.enabled&&fit.choice==='yes'&&other.choice==='no'&&passes(a.requires_planning,rule.planning)&&passes(fit,rule.fit))return 'interpreter';
  }
  return 'dynamic_agent';
}
export const METHOD={version:'two-exposed-groups-stable-plateau-v1',planningProbabilities:[0.8,0.85,0.9,0.95],planningMargins:[0.1,0.2,0.3],
  fitProbabilities:[0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95],fitMargins:[0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5],
  minimumPositivePerGroup:10,minimumNegativePerGroup:24,
  objective:'zero observed wrong admissions in both exposed groups; maximize worst-group coverage then total correct; choose center of tied plateau, not highest threshold'};
export type Row={id:string;group:'development'|'exposed-validation';expected:string;response:AtomicResponse};
const disabled=()=>({enabled:false,planning:{probability:0.95,margin:0.3},fit:{probability:0.95,margin:0.5}});
export function selectV2(rows:Row[]){
  if(new Set(rows.map(r=>r.group+'/'+r.id)).size!==rows.length)throw Error('Duplicate development identity');
  const groups=['development','exposed-validation'] as const;
  const policy:PolicyV2={version:'jev-atomic-admission-v2',contractVersion:VERSION,fixedWorkflow:'atomic-v1-preserved',interpreter:disabled()};
  const details=[];
  for(const route of ['interpreter'] as const){
    for(const group of groups){const subset=rows.filter(r=>r.group===group);
      if(subset.filter(r=>r.expected===route).length<METHOD.minimumPositivePerGroup
        ||subset.filter(r=>r.expected!==route).length<METHOD.minimumNegativePerGroup)throw Error('Insufficient group support');}
    const candidates=[];
    for(const pp of METHOD.planningProbabilities)for(const pm of METHOD.planningMargins)
      for(const fp of METHOD.fitProbabilities)for(const fm of METHOD.fitMargins){
        const rule={enabled:true,planning:{probability:pp,margin:pm},fit:{probability:fp,margin:fm}};
        const provisional={...policy,interpreter:rule};
        const admitted=rows.filter(r=>routeV2(r.response,provisional)===route);
        if(admitted.some(r=>r.expected!==route))continue;
        const coverage=groups.map(group=>admitted.filter(r=>r.group===group).length/rows.filter(r=>r.group===group&&r.expected===route).length);
        candidates.push({rule,correct:admitted.length,worst:Math.min(...coverage)});
      }
    candidates.sort((a,b)=>b.worst-a.worst||b.correct-a.correct);
    const best=candidates[0],plateau=candidates.filter(c=>best&&c.worst===best.worst&&c.correct===best.correct);
    if(best&&best.correct>0){
      const vector=(r:typeof best.rule)=>[r.planning.probability,r.planning.margin,r.fit.probability,r.fit.margin];
      const center=[0,1,2,3].map(i=>plateau.reduce((sum,c)=>sum+vector(c.rule)[i],0)/plateau.length);
      const distance=(r:typeof best.rule)=>vector(r).reduce((sum,n,i)=>sum+(n-center[i])**2,0);
      plateau.sort((a,b)=>distance(a.rule)-distance(b.rule)||vector(a.rule).reduce((a,b)=>a+b,0)-vector(b.rule).reduce((a,b)=>a+b,0));
      policy.interpreter=plateau[0].rule;
    }
    details.push({route,plateauSize:plateau.length,developmentCorrect:best?.correct??0,worstGroupCoverage:best?.worst??0});
  }
  return {policy,details};
}
export function statsV2(rows:Row[],policy:PolicyV2,route:FastRoute){
  const admitted=rows.filter(r=>routeV2(r.response,policy)===route);
  return {route,correct:admitted.filter(r=>r.expected===route).length,wrong:admitted.filter(r=>r.expected!==route).length};
}
