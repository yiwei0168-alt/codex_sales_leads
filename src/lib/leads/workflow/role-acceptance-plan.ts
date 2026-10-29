import {z} from 'zod';
import type {LeadSearchPlan} from '@/lib/assistant/types';
import {ALL_CHANNEL_ROLES} from './types';

/** Independent targets: one role reaching its target cannot satisfy another role. */
export function buildRoleAcceptancePlans(input:{countryCode:string;countryName:string;targetPerRole:number;userRequest:string}):LeadSearchPlan[]{
 const value=z.object({countryCode:z.string().regex(/^[A-Z]{2}$/),countryName:z.string().min(2).max(120),
  targetPerRole:z.number().int().min(1).max(100),userRequest:z.string().min(2).max(2000)}).strict().parse(input);
 return ALL_CHANNEL_ROLES.map(role=>({countryCode:value.countryCode,countryName:value.countryName,
  objective:'new-market',roles:[role],targetCount:value.targetPerRole,queryLanguage:'English',coverageMode:'mixed',
  userRequest:`${value.userRequest}\nThis independent task covers only ${role==='Agent'?'sales agent':role==='Brand Owner'?'brand owner':role}; target ${value.targetPerRole} finally qualified companies. Use public company evidence. Other channel roles do not count toward this task.`}));
}
