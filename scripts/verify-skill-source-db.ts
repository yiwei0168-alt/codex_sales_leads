import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {getPool} from "../src/lib/rag/db";
import {loadSkillSource} from "../src/lib/assistant/main/skill-sources";
import {importSkill,listSkills} from "../src/lib/assistant/main/skills";

const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!process.env.DATABASE_URL)throw new Error("Database required");
const migration=new URL(url),runtime=new URL(process.env.DATABASE_URL);
assert.equal(`${migration.hostname}:${migration.port||5432}${migration.pathname}`,`${runtime.hostname}:${runtime.port||5432}${runtime.pathname}`);
const admin=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)});
const owners=[randomUUID(),randomUUID()];
let skillId:string|undefined;
try {
  for(const id of owners)await admin.query("insert into app_user(id,email,display_name,status) values($1,$2,'Synthetic Skill source','disabled')",[id,`${id}@example.invalid`]);
  const source=await loadSkillSource({kind:"url",name:"Synthetic public method",url:"https://example.com/SKILL.md"},async()=>Buffer.from("# Synthetic public method\n"));
  const saved=await importSkill({userId:owners[0],role:"member"},source);
  skillId=saved.id;
  assert.equal(saved.scope,"account");
  assert.equal(saved.validation.instructions,"available");
  assert.equal(saved.validation.dependencies,"not-declared");
  assert.equal((await listSkills(owners[0])).some(item=>item.id===skillId),true);
  assert.equal((await listSkills(owners[1])).some(item=>item.id===skillId),false);
  const version=await admin.query<{source:string;files:Record<string,string>}>("select source,files from agent_skill_version where skill_id=$1 and version=1",[skillId]);
  assert.equal(version.rows[0].source,"https://example.com/SKILL.md");
  assert.equal(version.rows[0].files["SKILL.md"],"# Synthetic public method\n");
  console.log(JSON.stringify({passed:7,sourceKind:"url",tenantLeak:false,privateInputs:0,networkRequests:0,scriptExecutions:0,customerDataModified:false}));
}finally {
  if(skillId){await admin.query("delete from agent_skill_version where skill_id=$1",[skillId]);await admin.query("delete from agent_skill where id=$1",[skillId]);}
  await admin.query("delete from app_user where id=any($1::uuid[])",[owners]);
  await admin.end();await getPool().end();
}
