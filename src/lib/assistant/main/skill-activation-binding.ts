import type {PoolClient} from 'pg';
import {z} from 'zod';
import {digest} from './contracts';
import {AsyncLocalStorage} from 'node:async_hooks';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {skillActivationSourcesSchema} from './skill-activation-source-schema';
const checkingSources=new AsyncLocalStorage<Set<string>>();

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillActivationBindingSchema=z.object({
 protocol:z.literal('skill-activation-binding-v1'),ownerId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive(),
 bundleId:z.uuid(),artifactHash:sha,freezeId:z.uuid(),reviewHash:sha,
 reviewVersions:z.array(z.object({caseId:z.string(),revision:z.number().int().positive()}).strict()).max(1000),
 registryHash:sha,runtimePackageRevisions:z.array(z.string().regex(/^[1-9][0-9]*$/)).min(1).max(300)
  .refine(items=>new Set(items).size===items.length),
 validBefore:z.iso.datetime(),activationProofHash:sha,callId:z.uuid(),
 sources:skillActivationSourcesSchema,
 acceptanceLedgerHash:sha,
 sourceFenceId:z.uuid(),
 runtimeHash:sha,
}).strict();
export type ActivationBoundSkill={activation_binding?:unknown;activation_binding_hash?:string};
export function skillActivationFingerprint(skill:ActivationBoundSkill){
 return skill.activation_binding==null?skill.activation_binding_hash??null:digest(skill.activation_binding);
}
/** A negative lifecycle check, never a replacement for production qualification.
 * Missing schema/query errors on a bound Skill propagate; legacy manual Skills
 * have no binding and remain compatible with earlier database versions. */
export async function skillActivationCurrent(client:PoolClient,userId:string,skillId:string,version:number,binding:unknown){
 if(binding==null)return true;
 const parsed=skillActivationBindingSchema.safeParse(binding);
 if(!parsed.success||parsed.data.ownerId!==userId||parsed.data.skillId!==skillId||parsed.data.version!==version)return false;
 const checking=checkingSources.getStore()??new Set<string>(),key=`${userId}:${skillId}:${version}`;
 if(checking.has(key)||checking.size>=16)return false;
 return checkingSources.run(checking,()=>withBoundTenantTransaction(client,userId,async()=>{
  const isolation=(await client.query<{isolation:string}>("select current_setting('transaction_isolation') isolation")).rows[0]?.isolation;
  if(isolation!=='read committed')return false;
  // Callers may already hold business-source locks. Never wait in the reverse
  // admission order: deny this use if an operator is publishing/withdrawing.
  // Successful shared locks survive every recheck until the owning TX ends.
  for(const gate of ['skill-runner-trust-registry-v1','skill-runtime-packages-v1']){
   const admitted=(await client.query<{admitted:boolean}>(
    'select pg_try_advisory_xact_lock_shared(hashtextextended($1::text,0)) admitted',[gate])).rows[0]?.admitted;
   if(admitted!==true)return false;
  }
  // Qualification and the exact binding snapshot must agree in one statement.
  // A newer valid activation is not proof for an older caller's source ledger.
  const current=async()=>(await client.query<{current:boolean}>(`select skill_activation_is_current($1::uuid,$2::uuid,$3::integer)
   and exists(select 1 from agent_skill where owner_id=$1 and id=$2 and current_version=$3 and activation_binding=$4::jsonb) current`,
   [userId,skillId,version,parsed.data])).rows[0]?.current===true;
  if(!await current())return false;
  checking.add(key);
  try{
   const {skillSourceRuntimeHash}=await import('./skill-runtime-identity');
   if(await skillSourceRuntimeHash()!==parsed.data.runtimeHash)return false;
   const {captureSkillAcceptanceLedger}=await import('./skill-acceptance-ledger');
   const before=await captureSkillAcceptanceLedger(client,userId,parsed.data.bundleId,parsed.data.artifactHash);
   if(before.acceptanceLedgerHash!==parsed.data.acceptanceLedgerHash)return false;
   const {assertSkillActivationSourcesCurrent}=await import('./skill-activation-sources');
   await assertSkillActivationSourcesCurrent(client,userId,parsed.data.sources);
   const after=await captureSkillAcceptanceLedger(client,userId,parsed.data.bundleId,parsed.data.artifactHash);
   if(after.acceptanceLedgerHash!==before.acceptanceLedgerHash)return false;
   if(await skillSourceRuntimeHash()!==parsed.data.runtimeHash)return false;
   return await current();
  }catch{return false;}finally{checking.delete(key);}
 }));
}
export async function filterSkillActivationRows<T extends {id:string;current_version:number;enabled:boolean;activation_binding?:unknown}>(client:PoolClient,userId:string,rows:T[]){
 const result=[];
 for(const row of rows){
  const {activation_binding,...visible}=row;
  result.push({...visible,enabled:row.enabled&&await skillActivationCurrent(client,userId,row.id,row.current_version,activation_binding)});
 }
 return result;
}
export async function skillEnabledExpression(client:Pick<PoolClient,'query'>){
 const available=(await client.query<{available:boolean}>("select to_regprocedure('public.skill_activation_is_current(uuid,uuid,integer)') is not null available")).rows[0]?.available;
 return available===true?'s.enabled and skill_activation_is_current($1::uuid,s.id,s.current_version)':
  "s.enabled and (to_jsonb(s)->'activation_binding') is null";
}
