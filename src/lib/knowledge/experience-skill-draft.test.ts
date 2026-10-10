import {beforeEach,expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {experienceDraftPackage,proposeExperienceSkillInTransaction} from './experience-skill-draft';
const quote='I found comparing original tables reduced missed interface details.';
// A positive report can mention missed details as the thing reduced; the conservative draft filter may abstain.
const positive='I found comparing original tables reduced errors.';
let reports:Array<{id:string;run_id:string;message_id:string;source_receipt:object}>=[];
let existing=false;
const query=vi.fn(async(sql:string)=>{
  if(sql.startsWith('select s.id'))return {rows:existing?[{id:'skill'}]:[]};
  if(sql.includes('select distinct on(r.id)'))return {rows:reports};
  if(sql.startsWith('insert into agent_skill('))return {rows:[{id:'skill'}]};
  return {rows:[]};
});
const client={query} as unknown as PoolClient;
beforeEach(()=>{query.mockClear();reports=[];existing=false;});
it('builds a private instruction candidate without claiming verified success',()=>{
  const draft=experienceDraftPackage('comparison',positive)!;
  expect(draft.dependencies).toEqual([]);expect(Object.keys(draft.files)).toEqual(['SKILL.md']);
  expect(draft.files['SKILL.md']).toContain('尚未独立验证');
  expect(draft.files['SKILL.md']).toContain('发信、发布、正式评分和权限变更沿用原审批');
});
it('abstains on negative, ambiguous or credential-bearing reports',()=>{
  expect(experienceDraftPackage('method','I found this failed.')).toBeNull();
  expect(experienceDraftPackage('method',quote)).toBeNull();
  expect(experienceDraftPackage('method',`I found using sk-${'a'.repeat(32)} worked.`)).toBeNull();
});
it('requires repeated distinct completed task receipts before creating a draft',async()=>{
  reports=[{id:'observation',run_id:'run',message_id:'message',source_receipt:{}}];
  expect(await proposeExperienceSkillInTransaction(client,'owner','method',positive)).toBeNull();
  expect(query.mock.calls.some(([sql])=>sql.startsWith('insert'))).toBe(false);
});
it('creates only a disabled account draft with pending quality checks',async()=>{
  reports=[1,2].map(n=>({id:`obs-${n}`,run_id:`run-${n}`,message_id:`message-${n}`,source_receipt:{n}}));
  expect(await proposeExperienceSkillInTransaction(client,'owner','method',positive)).toEqual({id:'skill',created:true});
  expect(query.mock.calls.find(([sql])=>sql.startsWith('insert into agent_skill('))?.[0]).toContain("'account',false,false");
  const call=query.mock.calls.find(([sql])=>sql.startsWith('insert into agent_skill_version'));
  expect(call).toBeDefined();
});
it('does not overwrite or re-enable an existing draft on replay',async()=>{
  existing=true;
  expect(await proposeExperienceSkillInTransaction(client,'owner','method',positive)).toEqual({id:'skill',created:false});
  expect(query.mock.calls.some(([sql])=>sql.startsWith('insert')||sql.startsWith('update'))).toBe(false);
});
