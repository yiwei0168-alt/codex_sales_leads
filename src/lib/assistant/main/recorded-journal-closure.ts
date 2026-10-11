import {digest} from './contracts';
import type {RecordedEvidenceReceipt} from './recorded-evidence-receipts';

/** Enumerates the entire authoritative task journal, not just model-visible rows.
 * Earlier validators authenticate model attempts and individual read receipts.
 * This closes the gap between those subsets. It never executes or approves effects.
 */
export function assertRecordedJournalClosure(context:{userId:string;runId:string},rows:RecordedEvidenceReceipt[],
 modelIds:string[],readBindings:Array<{id:string;hash:string}>){
 const models=new Set(modelIds),reads=new Map<string,string>();
 if(models.size!==modelIds.length)throw new Error('Recorded journal model identity duplicated');
 for(const binding of readBindings){
  const previous=reads.get(binding.id);
  if(models.has(binding.id)||previous&&previous!==binding.hash)throw new Error('Recorded journal receipt binding inconsistent');
  reads.set(binding.id,binding.hash);
 }
 const seen=new Set<string>();
 for(const row of rows){
  if(seen.has(row.id)||row.user_id!==context.userId||row.run_id!==context.runId||row.status!=='completed'
   ||row.approval_id!==null||row.input_hash!==digest(row.input))throw new Error('Recorded journal contains an unbound or incomplete operation');
  seen.add(row.id);
  if(models.has(row.id)){
   if(row.tool_id!=='main_model'||row.effect!=='model')throw new Error('Recorded journal model contract changed');
  }else if(reads.has(row.id)){
   if(row.effect!=='read'||row.tool_id==='main_model'||digest(row)!==reads.get(row.id))throw new Error('Recorded journal read changed');
  }else throw new Error('Recorded journal contains an unconsumed operation');
 }
 if([...models,...reads.keys()].some(id=>!seen.has(id)))throw new Error('Recorded journal bound operation missing');
 return {completeReadOnlyJournalVerified:true as const,modelAttempts:models.size,consumedReads:reads.size,
  journalHash:digest([...rows].sort((a,b)=>a.id.localeCompare(b.id))),executionAuthorized:false as const,qualityAccepted:false as const};
}
