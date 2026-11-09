import {expect,it} from 'vitest';
import {parseDecisionResponse,type DecisionModel} from './decision-contract';
import {acceptedRoute,meetsDecisionThreshold,LEGACY_DECISION_POLICY_VERSION} from './decision-thresholds';

function response(model:DecisionModel,route:'fixed_workflow'|'interpreter',top:number,runnerUp:number){
  return parseDecisionResponse({id:'gen-threshold-test',model,usage:{input_tokens:1,output_tokens:1},answers:{route:{
    type:'choice',choice:route,confidence:1,probabilities:{fixed_workflow:route==='fixed_workflow'?top:(1-top-runnerUp)/2,
      interpreter:route==='interpreter'?top:(1-top-runnerUp)/2,dynamic_agent:runnerUp,uncertain:(1-top-runnerUp)/2}}}},model);
}
it('admits exact decimal boundaries without rounding away a genuine failure',()=>{
  const boundary=response('typesafe/jev-1.14','fixed_workflow',0.5,0.45);
  expect(acceptedRoute(boundary)).toBe('fixed_workflow');
  expect(acceptedRoute(response('typesafe/jev-1.14','fixed_workflow',0.5,0.450001))).toBe('dynamic_agent');
  expect(acceptedRoute(boundary,LEGACY_DECISION_POLICY_VERSION)).toBe('dynamic_agent');
});
it('separates path-specific and provider-specific thresholds',()=>{
  expect(acceptedRoute(response('typesafe/jev-1.14','interpreter',0.7,0.1))).toBe('dynamic_agent');
  expect(acceptedRoute(response('openai/gpt-6-luna-decisions','interpreter',0.7,0.1))).toBe('interpreter');
  expect(acceptedRoute(response('openai/gpt-6-luna-decisions','fixed_workflow',0.55,0.4))).toBe('fixed_workflow');
  expect(acceptedRoute(response('openai/gpt-6-luna-decisions','fixed_workflow',0.55,0.41))).toBe('dynamic_agent');
});
it('does not promote uncertain, unknown models or unknown policy versions',()=>{
  const sample=response('typesafe/jev-1.14','fixed_workflow',0.8,0.1);
  expect(acceptedRoute(sample,'unknown-policy')).toBe('dynamic_agent');
  expect(acceptedRoute({...sample,model:'typesafe/jev-1.140'})).toBe('dynamic_agent');
  expect(acceptedRoute({...sample,model:'typesafe/jev-1.14-20261014'})).toBe('fixed_workflow');
  sample.answers.route.choice='uncertain';expect(acceptedRoute(sample)).toBe('dynamic_agent');
});
it('rejects invalid or disabled numeric policies rather than treating confidence as accuracy',()=>{
  const sample=response('typesafe/jev-1.14','fixed_workflow',0.8,0.1);
  for(const threshold of [{enabled:false,topProbability:0.5,topTwoMargin:0.05},
    {enabled:true,topProbability:NaN,topTwoMargin:0.05},{enabled:true,topProbability:0.5,topTwoMargin:-1}])
    expect(meetsDecisionThreshold(sample,'fixed_workflow',threshold)).toBe(false);
  sample.answers.route.confidence=0;expect(acceptedRoute(sample)).toBe('fixed_workflow');
});
