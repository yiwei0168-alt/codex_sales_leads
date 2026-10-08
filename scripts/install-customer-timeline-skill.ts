import nextEnv from '@next/env';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {tenantQuery,getPool} from '../src/lib/rag/db';
import {importSkill,changeSkill} from '../src/lib/assistant/main/skills';
nextEnv.loadEnvConfig(process.cwd());
const userId=z.uuid().parse(process.argv[2]);
const source='local:customer-communication-timeline-v1';
try{
 const existing=await tenantQuery<{id:string;current_version:number}>(userId,`select s.id,s.current_version from agent_skill s join agent_skill_version v on v.skill_id=s.id and v.version=s.current_version
  where s.owner_id=$1 and s.scope='account' and v.source=$2`,[userId,source]);
 const context={userId,role:'member' as const};
 const skill=existing[0]?{id:existing[0].id,version:existing[0].current_version}:await importSkill(context,{name:'客户沟通时间线',source,files:{'SKILL.md':await readFile('product-skills/customer-communication-timeline/SKILL.md','utf8')},dependencies:[]});
 await changeSkill(context,{id:skill.id!,version:skill.version,operation:'enable'},true);
 console.log(JSON.stringify({installed:true,scope:'account',version:skill.version}));
}finally{await getPool().end();}
