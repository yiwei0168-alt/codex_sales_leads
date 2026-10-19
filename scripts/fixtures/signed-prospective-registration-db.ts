import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {digest,type ModelConfig,type ModelMessage} from '../../src/lib/assistant/main/contracts';
import {prepareShadowRegistration} from '../../src/lib/assistant/main/skill-shadow';
import {freezeSkillAcceptancePlan} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import {skillSourceRuntimeHash} from '../../src/lib/assistant/main/skill-runtime-identity';
import {modelFunctions} from '../../src/lib/assistant/main/model';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import type {z} from 'zod';
import type {skillAcceptancePlanSchema} from '../../src/lib/assistant/main/skill-acceptance-policy';
type PlanCases=z.infer<typeof skillAcceptancePlanSchema>['cases'];

/** Freeze before run insertion, so the real capture trigger supplies provenance. */
export async function registerSignedProspectiveFixture(pool:Pool,input:{owner:string;skillId:string;task:{content:string;attachments:Array<{assetId:string}>};config:ModelConfig;messages:ModelMessage[];otherCases?:PlanCases}){
 const registration=await prepareShadowRegistration(input.owner,{skillId:input.skillId,version:1,hours:1,selection:{kind:'whole-read-only-task'}}),campaignId=randomUUID();
 await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
  values($1,$2,$3,1,$4,$5,$6,true,clock_timestamp()+interval '1 hour')`,[campaignId,input.owner,input.skillId,registration.contentHash,registration.sourceHash,JSON.stringify(registration.config)]);
 const sqlHash=async(value:unknown)=>(await pool.query('select skill_shadow_json_hash($1::jsonb) hash',[JSON.stringify(value)])).rows[0].hash as string;
 const start={kind:'prospective-server-capture',campaignId,skillId:input.skillId,version:1,contentHash:registration.contentHash,sourceHash:registration.sourceHash,config:registration.config,
  inputHash:await sqlHash(input.task),modelConfigHash:await sqlHash(input.config),requestHash:digest(input.task),createdRunStatus:'queued'};
 const transaction:SkillCollectorTransaction=async(owner,work)=>{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
   const result=await work(client);await client.query('commit');return result;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 const placeholder=digest('unexecuted-other-cases');
 const frozen=await freezeSkillAcceptancePlan({userId:input.owner},{protocol:'skill-acceptance-plan-v1',pin:{ownerId:input.owner,skillId:input.skillId,version:1,contentHash:registration.contentHash,sourceHash:registration.sourceHash},
  identity:{runtimeHash:await skillSourceRuntimeHash(),promptHash:digest(input.messages.filter((row,index)=>row.role==='system'&&index!==1)),toolSchemaHash:digest(modelFunctions),modelConfigHash:digest(input.config),
   scopeHash:digest({userId:input.owner,role:'member',mode:input.config.profile!.mode,knowledgeScope:null})},expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:[{id:'signed-shadow',category:'shadow',provenance:'prospective-task',inputHash:digest(input.task),sourceHash:digest(start)},
   ...(input.otherCases??(['replay','negative','injection','permissions'] as const).map(category=>({id:category,category,provenance:category==='replay'?'historical-task' as const:'safety-fixture' as const,inputHash:placeholder,sourceHash:placeholder})))]},transaction);
 return {frozen,start};
}
