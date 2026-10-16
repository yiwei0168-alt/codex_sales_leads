import {z} from 'zod';
import {digest} from './contracts';
import {modeConfigSchema} from './mode-config';
import type {RecordedModelCall} from './model-request-replay';
import {retryableModeFailureReasons} from './mode-failure-reasons';

type Attempt=RecordedModelCall&{id:string;call_key:string;status:string};
/** Check persisted fallback decisions. Does not retry, infer missing receipts or authorize new calls. */
export function assertRecordedFallbackChain(attempts:Attempt[]){
 const groups=new Map<string,Array<{row:Attempt;index:number;input:{messages:unknown[];profile:z.infer<typeof modeConfigSchema>;index:number}}>>();
 const ids=new Set<string>();
 for(const row of attempts){
  if(ids.has(row.id)||row.status!=='completed'||digest(row.input)!==row.input_hash)throw new Error('Recorded fallback journal invalid');
  ids.add(row.id);
  const key=/^mode-model:(\d+):(\d+):([012])$/.exec(row.call_key);
  if(!key)throw new Error('Recorded fallback key invalid');
  const input=z.object({messages:z.array(z.unknown()),profile:modeConfigSchema,index:z.number().int().min(0).max(2)}).strict().parse(row.input);
  if(input.index!==Number(key[3]))throw new Error('Recorded fallback index mismatch');
  const group=`${key[1]}:${key[2]}`,rows=groups.get(group)??[];
  rows.push({row,index:input.index,input});groups.set(group,rows);
 }
 for(const group of groups.values()){
  group.sort((a,b)=>a.index-b.index);
  for(let i=0;i<group.length;i++){
   const attempt=group[i];
   if(attempt.index!==i)throw new Error('Recorded fallback predecessor missing or duplicated');
   if(digest({messages:attempt.input.messages,profile:attempt.input.profile})!==digest({messages:group[0].input.messages,profile:group[0].input.profile}))throw new Error('Recorded fallback request changed');
   if(i===group.length-1){
    if(z.object({status:z.string()}).parse(attempt.row.output).status!=='success')throw new Error('Recorded fallback group has no selected response');
   }else{
    z.object({status:z.literal('unavailable'),data:z.object({retryable:z.literal(true),reason:z.enum(retryableModeFailureReasons)})}).parse(attempt.row.output);
   }
  }
 }
 if(!groups.size)throw new Error('Recorded fallback journal empty');
 return {fallbackJournalVerified:true as const,attempts:attempts.length,decisions:groups.size,hash:digest(attempts)};
}
