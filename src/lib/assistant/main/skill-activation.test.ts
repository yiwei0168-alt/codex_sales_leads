import {beforeEach,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({queries:[] as Array<{sql:string;args:unknown[]}>,validation:{scripts:"unverified-requires-sandbox",dependencies:"none"}}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:async(_userId:string,run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
  query:async(sql:string,args:unknown[])=>{db.queries.push({sql,args});
    if(sql.startsWith("insert into agent_skill("))return {rows:[{id:"00000000-0000-4000-8000-000000000001"}],rowCount:1};
    if(sql.startsWith("select v.validation"))return {rows:[{validation:db.validation}],rowCount:1};
    return {rows:[],rowCount:1};},
})}));
import {changeSkill,importSkill} from "./skills";
const context={userId:"00000000-0000-4000-8000-000000000001",role:"member" as const};
beforeEach(()=>{db.queries=[];db.validation={scripts:"unverified-requires-sandbox",dependencies:"none"};});
it("imports a package with a script as disabled",async()=>{
  await importSkill(context,{name:"Audit",source:"user",files:{"SKILL.md":"Read the audit script","scripts/audit.py":"print('ok')"},dependencies:[]});
  expect(db.queries.find(call=>call.sql.startsWith("insert into agent_skill("))?.args.at(-1)).toBe(false);
});
it("rejects Agent activation of script versions while retaining human version action",async()=>{
  const action={id:"00000000-0000-4000-8000-000000000002",version:1,operation:"enable" as const};
  await expect(changeSkill(context,action)).rejects.toThrow("human approval");
  expect(db.queries.some(call=>call.sql.startsWith("update agent_skill set enabled"))).toBe(false);
  await expect(changeSkill(context,action,true)).resolves.toEqual({updated:true});
});
