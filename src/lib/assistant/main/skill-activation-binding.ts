import type {PoolClient} from 'pg';
import {z} from 'zod';
import {digest} from './contracts';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillActivationBindingSchema=z.object({
 protocol:z.literal('skill-activation-binding-v1'),ownerId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive(),
 bundleId:z.uuid(),artifactHash:sha,freezeId:z.uuid(),reviewHash:sha,
 reviewVersions:z.array(z.object({caseId:z.string(),revision:z.number().int().positive()}).strict()).max(1000),
 registryHash:sha,runtimePackageRevisions:z.array(z.string().regex(/^[1-9][0-9]*$/)).min(1).max(300)
  .refine(items=>new Set(items).size===items.length),
 validBefore:z.iso.datetime(),activationProofHash:sha,callId:z.uuid(),
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
 if(!parsed.success||parsed.data.skillId!==skillId||parsed.data.version!==version)return false;
 return (await client.query<{current:boolean}>('select skill_activation_is_current($1::uuid,$2::uuid,$3::integer) current',
  [userId,skillId,version])).rows[0]?.current===true;
}
export async function skillEnabledExpression(client:Pick<PoolClient,'query'>){
 const available=(await client.query<{available:boolean}>("select to_regprocedure('public.skill_activation_is_current(uuid,uuid,integer)') is not null available")).rows[0]?.available;
 return available===true?'s.enabled and skill_activation_is_current($1::uuid,s.id,s.current_version)':
  "s.enabled and (to_jsonb(s)->'activation_binding') is null";
}
