import {expect,it} from 'vitest';
import {calibrateThreshold,thresholdStats,type CalibrationRow} from './decision-calibration';
import {parseDecisionResponse} from '@/providers/decision-contract';
const model='typesafe/jev-1.14';
function row(id:number,positive:boolean,family:string):CalibrationRow {
  return {id:String(id),family,split:'development',expected:positive?'fixed_workflow':'dynamic_agent',
    state:{request:'synthetic',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false},
    response:parseDecisionResponse({id:`gen-fixture-${id}`,model,usage:{input_tokens:1,output_tokens:1},answers:{route:{type:'choice',
      choice:positive?'fixed_workflow':'dynamic_agent',confidence:1,
      probabilities:{fixed_workflow:positive?0.7:0.1,dynamic_agent:positive?0.1:0.7,interpreter:0.1,uncertain:0.1}}}},model)};
}
const training=()=>Array.from({length:24},(_,i)=>row(i,i<8,`${i<8?'positive':'negative'}-${i%2}`));
it('maximizes safe development coverage and uses conservative tie-breaks',()=>{
  const chosen=calibrateThreshold(training(),'fixed_workflow');
  expect(chosen.threshold).toEqual({enabled:true,topProbability:0.7,topTwoMargin:0.5});
  expect(thresholdStats(training(),'fixed_workflow',chosen.threshold)).toMatchObject({admitted:8,correct:8,wrong:0});
});
it('cannot select a low threshold that admits a high-probability wrong route',()=>{
  const rows=training(),wrong=row(24,true,'dangerous-negative');wrong.expected='dynamic_agent';
  wrong.response.answers.route.probabilities={fixed_workflow:0.85,dynamic_agent:0.05,interpreter:0.05,uncertain:0.05};
  rows.push(wrong);const chosen=calibrateThreshold(rows,'fixed_workflow');
  expect(chosen.threshold.enabled).toBe(false);
});
it('rejects exposed holdout labels and duplicate rows at the selector boundary',()=>{
  const rows=training();rows[0].split='holdout';
  expect(()=>calibrateThreshold(rows,'fixed_workflow')).toThrow('development-only');
  const duplicate=training();duplicate.push(duplicate[0]);expect(()=>calibrateThreshold(duplicate,'fixed_workflow')).toThrow('Duplicate');
});
it('does not certify a policy from one positive template family or insufficient support',()=>{
  const rows=training();rows.filter(r=>r.expected==='fixed_workflow').forEach(r=>{r.family='one-family';});
  expect(calibrateThreshold(rows,'fixed_workflow').threshold.enabled).toBe(false);
  expect(calibrateThreshold(training().slice(0,7),'fixed_workflow').threshold.enabled).toBe(false);
});
it('does not admit requests whose missing context was skipped in production',()=>{
  const rows=training();rows[0].state.hasHistory=true;rows[1].state.hasAttachments=true;
  rows[2].state.hasPolicy=true;rows[3].state.hasKnowledgeScope=true;
  expect(thresholdStats(rows,'fixed_workflow',{enabled:true,topProbability:0.5,topTwoMargin:0.05}).admitted).toBe(4);
});
