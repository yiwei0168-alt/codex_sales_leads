import type {PoolClient} from 'pg';
import {z} from 'zod';
import {messageInputSchema} from './contracts';
import {lockSkillRuntimeMaterialSources} from './skill-runtime-material-sources';
import {lockSkillReadReceiptSources} from './skill-read-source-locks';
export {skillAcceptanceMailIds,skillAcceptanceTimelineSelection} from './skill-read-source-locks';

type Artifact={plan:{cases:ReadonlyArray<{id:string;provenance:string}>};rawReceipts:Record<string,unknown>};
/** Derive exclusively from the stored bundle, never from request-supplied run IDs. */
export function skillAcceptanceRunIds({plan,rawReceipts}:Artifact){
 const runs=new Set<string>();
 const reference=(name:string,caseId:string)=>z.object({runId:z.uuid()}).passthrough().parse(
  z.record(z.string(),z.unknown()).parse(rawReceipts[name])[caseId]).runId;
 for(const item of plan.cases){
  if(item.provenance==='historical-task'){
   const runId=reference('baselineSources',item.id);
   if(reference('candidateSources',item.id)!==runId)throw new Error('Locked historical arm sources differ');
   runs.add(runId);
  }else if(item.provenance==='prospective-task'||item.provenance==='safety-fixture'){
   runs.add(reference(item.provenance==='prospective-task'?'prospectiveSources':'safetySources',item.id));
  }else throw new Error('Unsupported acceptance source provenance');
 }
 return z.array(z.uuid()).min(1).max(100).parse([...runs].sort());
}
export function skillAcceptanceAttachmentIds(runs:ReadonlyArray<{input:unknown}>){
 const ids=new Set<string>();
 for(const run of runs)for(const attachment of z.object({attachments:messageInputSchema.shape.attachments}).parse(run.input).attachments)ids.add(attachment.assetId);
 return [...ids].sort();
}
export function skillAcceptanceProspectiveBindings({plan,rawReceipts}:Artifact){
 const jobs=new Map<string,string>();
 for(const item of plan.cases.filter(row=>row.provenance==='prospective-task')){
  const value=z.object({jobId:z.uuid(),runId:z.uuid()}).passthrough().parse(z.record(z.string(),z.unknown()).parse(rawReceipts.prospectiveSources)[item.id]);
  if(jobs.has(value.jobId)&&jobs.get(value.jobId)!==value.runId)throw new Error('Prospective capture run binding differs');
  jobs.set(value.jobId,value.runId);
 }
 return [...jobs].sort(([a],[b])=>a.localeCompare(b)).map(([jobId,runId])=>({jobId,runId}));
}
/** Caller owns the account-bound transaction. Parent UPDATE locks also block new
 * journal rows via their run FK; existing rows require their own SHARE locks.
 * Attachment metadata is locked separately below. External bytes and other
 * evidence domains still require their own protection before activation. */
export async function lockSkillAcceptanceRunJournals(client:PoolClient,userId:string,artifact:Artifact){
 const original=await lockRecordedTaskRunJournals(client,userId,skillAcceptanceRunIds(artifact),{prospective:skillAcceptanceProspectiveBindings(artifact)});
 return {...original,...await lockSkillRuntimeMaterialSources(client,userId,artifact)};
}
/** Shared retained source locks for acceptance and ordinary final settlement.
 * IDs are derived by their server caller; no HTTP/task input can select them. */
export async function lockRecordedTaskRunJournals(client:PoolClient,userId:string,runIds:string[],options:{prospective?:Array<{jobId:string;runId:string}>;successfulReadSourcesOnly?:boolean}={}){
 z.uuid().parse(userId);const ids=[...new Set(z.array(z.uuid()).min(1).max(100).parse(runIds))].sort();
 const prospective=options.prospective??[];
 const origins=(await client.query<{n:number}>('select lock_skill_task_origins($1::uuid[]) n',[ids])).rows[0]?.n;
 if(origins!==ids.length)throw new Error('Acceptance task origin lock incomplete');
 const runs=await client.query<{id:string;input:unknown}>(`select id,input from agent_run where user_id=$1 and id=any($2::uuid[])
  order by id for update`,[userId,ids]);
 if(runs.rows.length!==ids.length)throw new Error('Acceptance source task unavailable');
 const attachments=skillAcceptanceAttachmentIds(runs.rows);
 for(let offset=0;offset<attachments.length;offset+=100){
  const batch=attachments.slice(offset,offset+100);
  const locked=(await client.query<{n:number}>('select lock_skill_attachment_sources($1::uuid[]) n',[batch])).rows[0]?.n;
  if(locked!==batch.length)throw new Error('Acceptance attachment source lock incomplete');
 }
 const journal=await client.query<{id:string;tool_id:string;input:unknown;effect:string;status:string;output:unknown}>(`select id,tool_id,input,effect,status,output from agent_tool_call where user_id=$1 and run_id=any($2::uuid[]) order by id for share`,[userId,ids]);
 const sourceRows=options.successfulReadSourcesOnly?journal.rows.filter(row=>row.effect==='read'&&row.status==='completed'&&['success','partial'].includes(String((row.output as {status?:unknown}|null)?.status))):journal.rows;
 const readSources=await lockSkillReadReceiptSources(client,userId,sourceRows);
 for(let offset=0;offset<prospective.length;offset+=100){
  const batch=prospective.slice(offset,offset+100);
  const count=(await client.query<{n:number}>('select lock_skill_shadow_sources($1::uuid[],$2::uuid[]) n',[batch.map(row=>row.jobId),batch.map(row=>row.runId)])).rows[0]?.n;
  if(count!==batch.length)throw new Error('Acceptance prospective source lock incomplete');
 }
 return {prospectiveCaptureSourcesLocked:true as const,prospectiveJobCount:prospective.length,...readSources,attachmentMetadataLocked:true as const,attachmentCount:attachments.length,taskOriginsLocked:true as const,taskJournalsLocked:true as const,runCount:ids.length};
}
