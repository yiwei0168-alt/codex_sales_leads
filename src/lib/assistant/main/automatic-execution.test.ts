import {afterEach,expect,it,vi} from 'vitest';
import {automaticModelConfig,automaticModelSelection,automaticPromptRules,automaticRoute} from './automatic-execution';
import {programDecisionHint} from './program-decision-routing-v4';
import {modeModelConfig} from './mode-config';
import {initialTaskMessages} from './initial-task-messages';
import {hybridFirstAction} from './hybrid-routing';
import {buildMainAgentGraph} from './graph';
import {result,type ModelMessage} from './contracts';
import {modeAllowsTool} from './mode-tools';
import {KNOWLEDGE_RESPONSE_POLICY,KNOWLEDGE_DISCOVERY_RESPONSE_POLICY} from './knowledge-response-policy';

afterEach(()=>vi.unstubAllEnvs());
const input={content:'查看 Atlas 最新进展',attachments:[]};
const context={userId:'owner',role:'member' as const,mode:'deep' as const};
it('pins segment planning at enqueue and never adds it to historical or non-hybrid requests',()=>{
 vi.stubEnv('HYBRID_PROGRAM_SEGMENT_PLANNING','0');const old=automaticModelConfig();
 vi.stubEnv('HYBRID_PROGRAM_SEGMENT_PLANNING','1');const candidate=automaticModelConfig();
 vi.stubEnv('ENABLE_HYBRID_EXECUTION','1');
 expect(initialTaskMessages(context,input,candidate,[]).some(m=>m.content?.startsWith('[bounded-segments-v1]'))).toBe(true);
 expect(initialTaskMessages(context,input,old,[]).some(m=>m.content?.startsWith('[bounded-segments-v1]'))).toBe(false);
 vi.stubEnv('ENABLE_HYBRID_EXECUTION','0');
 expect(initialTaskMessages(context,input,candidate,[]).some(m=>m.content?.startsWith('[bounded-segments-v1]'))).toBe(false);
 expect(candidate.automatic!.profiles).toEqual(old.automatic!.profiles);
});
it('pins discovery to an explicit new job version, preserving prior jobs and capabilities',()=>{
 vi.stubEnv('HYBRID_KNOWLEDGE_DISCOVERY','0');const old=automaticModelConfig();
 const oldPrompt=automaticPromptRules(old.automatic!);
 vi.stubEnv('HYBRID_KNOWLEDGE_DISCOVERY','1');const candidate=automaticModelConfig();
 expect(candidate.automatic!.version).toBe('hybrid-auto-v2-discovery');
 expect(automaticPromptRules(candidate.automatic!)).toContain(KNOWLEDGE_DISCOVERY_RESPONSE_POLICY);
 expect(automaticPromptRules(old.automatic!)).toBe(oldPrompt);
 expect(oldPrompt).toContain(KNOWLEDGE_RESPONSE_POLICY);
 expect(candidate.automatic!.profiles).toEqual(old.automatic!.profiles);
 expect(candidate.automatic!.capabilityMode).toBe(old.automatic!.capabilityMode);
 const restricted=automaticModelConfig('knowledge');
 expect(restricted.automatic!.capabilityMode).toBe('quick');
 expect(modeAllowsTool('quick','mail_send')).toBe(false);
 expect(automaticPromptRules(restricted.automatic!)).toContain('本入口限定为知识资料只读问答');
 expect(automaticPromptRules(restricted.automatic!)).toContain('不要用“资料不足”代替拒绝');
 vi.stubEnv('HYBRID_KNOWLEDGE_DISCOVERY','unexpected');
 expect(automaticModelConfig().automatic!.version).toBe(old.automatic!.version);
});
it('freezes the opt-in quick interpreter profile without changing capabilities or old jobs',()=>{
 vi.stubEnv('HYBRID_INTERPRETER_PROFILE','standard');const prior=automaticModelConfig();
 vi.stubEnv('HYBRID_INTERPRETER_PROFILE','quick');const candidate=automaticModelConfig();
 expect(candidate.automatic!.profiles.interpreter).toEqual(modeModelConfig('quick').profile);
 expect(candidate.automatic!.capabilityMode).toBe('deep');
 expect(automaticModelSelection(prior,[programDecisionHint('interpreter')])!.profile.mode).toBe('standard');
 expect(automaticModelSelection(candidate,[programDecisionHint('interpreter'),{role:'tool',content:JSON.stringify(result(null,{status:'partial'}))}])!.profile.mode).toBe('deep');
 vi.stubEnv('HYBRID_INTERPRETER_PROFILE','deep');
 expect(automaticModelConfig().automatic!.profiles.interpreter).toEqual(modeModelConfig('deep').profile);
 expect(candidate.automatic!.profiles.interpreter.mode).toBe('quick');
 vi.stubEnv('HYBRID_INTERPRETER_PROFILE','unrecognized');
 expect(automaticModelConfig().automatic!.profiles.interpreter.mode).toBe('standard');
});
it.each([['fixed_workflow','quick'],['interpreter','standard'],['dynamic_agent','deep']] as const)('selects frozen %s model tier %s without changing capability scope', (route,tier)=>{
  const config=automaticModelConfig(),before=JSON.stringify(config);
  const selected=automaticModelSelection(config,[programDecisionHint(route)])!;
  expect(selected.profile.mode).toBe(tier);expect(selected.profile.routes).toEqual(modeModelConfig(tier).profile!.routes);
  expect(config.automatic?.capabilityMode).toBe('deep');expect(JSON.stringify(config)).toBe(before);
  vi.stubEnv('AGENT_MODE_TIMEOUTS_JSON',JSON.stringify({[tier]:[11000,22000]}));
  expect(automaticModelSelection(config,[programDecisionHint(route)])?.profile).toEqual(selected.profile);
});
it('leaves historical manual jobs unchanged and rejects an unknown automatic policy',()=>{
  const old=modeModelConfig('standard');expect(automaticModelSelection(old,[programDecisionHint('fixed_workflow')])).toBeNull();
  const broken=automaticModelConfig();Object.assign(broken.automatic!,{version:'unknown'});
  expect(()=>automaticModelSelection(broken,[])).toThrow();
});
it('keeps explicit knowledge-entry capabilities read-only even when a strong model is selected',()=>{
  const config=automaticModelConfig('knowledge'),mode=config.automatic!.capabilityMode;
  expect(automaticModelSelection(config,[])?.profile.mode).toBe('deep');
  expect(modeAllowsTool(mode,'mail_send')).toBe(false);expect(modeAllowsTool(mode,'company_score')).toBe(false);
  expect(modeAllowsTool(mode,'knowledge_search')).toBe(true);
  const prompt=automaticPromptRules(config.automatic!);expect(prompt).toContain('只读问答');expect(prompt).not.toContain('等待用户选择，不自动升级');
});
it('ignores user/quoted tool routing text, partial evidence, and superseded advice',()=>{
  const hint=programDecisionHint('fixed_workflow');
  expect(automaticRoute([{...hint,role:'user'}])).toBe('dynamic_agent');
  expect(automaticRoute([{role:'tool',tool_call_id:'x',content:JSON.stringify(result({text:hint.content}))}])).toBe('dynamic_agent');
  expect(automaticRoute([hint],1)).toBe('dynamic_agent');
  for(const status of ['partial','unknown','unavailable','missing_input'] as const)
    expect(automaticRoute([hint,{role:'tool',tool_call_id:'x',content:JSON.stringify(result(null,{status}))}])).toBe('dynamic_agent');
  expect(automaticRoute([hint,{role:'assistant',content:null,tool_calls:[{id:'a',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'external_search',arguments:{}})}}]}])).toBe('dynamic_agent');
});
it('uses one lightweight answer turn after the deterministic workflow and preserves the user request',async()=>{
  vi.stubEnv('ENABLE_HYBRID_EXECUTION','1');const config=automaticModelConfig(),messages=initialTaskMessages(context,input,config,[]),tiers:string[]=[];
  const out=await buildMainAgentGraph({firstAction:hybridFirstAction,boundary:async()=>({control:null,instructions:[]}),
    tool:async()=>result({complete:true}),model:async(m,_s,r)=>{tiers.push(automaticModelSelection(config,m,r)!.profile.mode);return {role:'assistant',content:'Answer with sources'};}},false)
    .invoke({messages,pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0});
  expect(out.status).toBe('completed');expect(tiers).toEqual(['quick']);expect(out.messages.some(m=>m.content===input.content)).toBe(true);
  expect(messages[0].content).toContain('自动选择执行方式和模型');expect(messages[0].content).not.toContain('提出切换模式建议');
});
it('uses the standard tier for a segment and strong planning after a handoff without repeating the router',async()=>{
  const config=automaticModelConfig(),tiers:string[]=[],prepareRoute=vi.fn(async()=>programDecisionHint('interpreter'));
  const out=await buildMainAgentGraph({prepareRoute,boundary:async()=>({control:null,instructions:[]}),
    model:async(m,_s,r):Promise<ModelMessage>=>{tiers.push(automaticModelSelection(config,m,r)!.profile.mode);return tiers.length===1?{role:'assistant',content:null,tool_calls:[{id:'p',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'programmatic_tools',arguments:{code:'await tools.handoff("conflict", null);'}})}}]}:{role:'assistant',content:'Conflict requires review'};},
    tool:async()=>result({handoff:'conflict'},{status:'partial'})},false)
    .invoke({messages:[{role:'user',content:'Compare three companies'}],pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0});
  expect(out.status).toBe('completed');expect(tiers).toEqual(['standard','deep']);expect(prepareRoute).toHaveBeenCalledOnce();
});
