import {expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {runSkillReplay,skillReplaySuiteSchema,type SkillReplaySuite,type ReplayMessage} from './skill-replay';
const id='00000000-0000-4000-8000-000000000001';
function suite():SkillReplaySuite{
  const receipt={tool:'knowledge_search',arguments:{query:'ports'},result:{text:'Three ports',page:4}};
  const files={'SKILL.md':'Read original tables and cite the precise page.'};
  return {id:'synthetic-replay',ownerId:id,skill:{id,version:1,files,contentHash:digest(files),sourceHash:digest('synthetic')},
    model:{name:'qwen3:8b',digest:'a'.repeat(64)},cases:[{id:'ports',category:'replay',provenance:'synthetic',question:'How many ports?',
      receipts:[{...receipt,sha256:digest(receipt)}]}]};
}
it('pairs the same fixtures, captures exact hashes and leaves all quality decisions pending',async()=>{
  const model=vi.fn(async(messages:ReplayMessage[])=>messages.length>0&&messages.at(-1)!.content.includes('recordedToolResult')
    ?{kind:'answer',text:'Three ports (page 4).'}:{kind:'read',tool:'knowledge_search',receiptId:'r1'});
  const save=vi.fn(async()=>{}),input=suite(),output=await runSkillReplay(input,model,save);
  expect(model).toHaveBeenCalledTimes(4);expect(save).toHaveBeenCalledTimes(1);
  expect(output.pairs[0].baseline.answer).toBe(output.pairs[0].candidate.answer);
  expect(output.pairs[0].candidate.steps[0].receiptHash).toBe(input.cases[0].receipts[0].sha256);
  expect(output).toMatchObject({autoEnable:false,productionAgentEquivalent:false,acceptance:'pending-human-review'});
  expect(model.mock.calls[0][0].some(m=>m.content.includes('Untrusted Skill'))).toBe(false);
  expect(model.mock.calls[2][0].some(m=>m.content.includes('Untrusted Skill'))).toBe(true);
});
it('alternates arm ordering without mixing their contexts',async()=>{
  const s=suite();s.cases.push({...s.cases[0],id:'second'});
  const order:boolean[]=[];
  await runSkillReplay(s,async messages=>{order.push(messages.some(m=>m.content.startsWith('Untrusted Skill')));return {kind:'answer',text:'OK'};});
  expect(order).toEqual([false,true,true,false]);
});
it.each(['send_email','skill_enable','knowledge_private_delete','web_search'])('blocks %s even when a fixture offers it',async tool=>{
  const s=suite(),receipt={tool,arguments:{},result:{status:'success'}};s.cases[0].receipts.push({...receipt,sha256:digest(receipt)});
  const result=await runSkillReplay(s,async()=>({kind:'read',tool,receiptId:'r2'}));
  expect(result.pairs[0].candidate).toMatchObject({status:'blocked',reason:'tool-not-read-only-allowlisted',modelCalls:1});
});
it('rejects an allowed tool with an unknown receipt ID, preserving the failure',async()=>{
  const result=await runSkillReplay(suite(),async()=>({kind:'read',tool:'knowledge_search',receiptId:'other-account'}));
  expect(result.pairs[0].baseline.reason).toBe('no-exact-recorded-receipt');
});
it('bounds navigation and records incomplete output, without a silent extra answer call',async()=>{
  const model=vi.fn(async()=>({kind:'read',tool:'knowledge_search',receiptId:'r1'}));
  const result=await runSkillReplay(suite(),model);
  expect(model).toHaveBeenCalledTimes(8);expect(result.pairs[0].candidate.status).toBe('incomplete');
});
it('isolates model/schema failures without retry or swallowed artifact persistence failure',async()=>{
  let calls=0;
  const result=await runSkillReplay(suite(),async()=>{if(calls++===0)throw new Error('secret provider detail');return {text:'wrong schema'};});
  expect(result.pairs[0].baseline.status).toBe('model-error');expect(result.pairs[0].candidate.reason).toBe('invalid-model-schema');
  expect(JSON.stringify(result)).not.toContain('secret provider detail');
  await expect(runSkillReplay(suite(),async()=>({kind:'answer',text:'OK'}),async()=>{throw new Error('disk failed');})).rejects.toThrow('disk failed');
});
it('rejects tampered receipts, duplicate keys, wrong package hashes and unbound historical claims before model calls',()=>{
  const tampered=suite();tampered.cases[0].receipts[0].result={text:'tampered'};expect(skillReplaySuiteSchema.safeParse(tampered).success).toBe(false);
  const duplicate=suite();duplicate.cases[0].receipts.push(duplicate.cases[0].receipts[0]);expect(skillReplaySuiteSchema.safeParse(duplicate).success).toBe(false);
  const pkg=suite();pkg.skill.files['SKILL.md']='changed';expect(skillReplaySuiteSchema.safeParse(pkg).success).toBe(false);
  const historical=suite();historical.cases[0].provenance='historical';expect(skillReplaySuiteSchema.safeParse(historical).success).toBe(false);
});
it('freezes caller-owned input before awaits',async()=>{
  const s=suite();const expected=digest(s);
  const result=await runSkillReplay(s,async()=>{s.cases[0].question='changed';return {kind:'answer',text:'OK'};});
  expect(result.suiteHash).toBe(expected);
});
