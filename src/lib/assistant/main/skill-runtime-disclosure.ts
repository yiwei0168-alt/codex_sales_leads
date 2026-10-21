import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {preparePublicReviewDisclosure} from '@/lib/leads/workflow/public-review-disclosure';
import {digest,toolResultSchema,type ModelMessage} from './contracts';
import {toolModelView} from './tool-model-view';
import {resolveLockedSkillKnowledgeReceiptAssets} from './skill-knowledge-receipt-bytes';
import type {runSkillCandidateArm} from './skill-candidate-runner';
import {SkillReadDisclosureError} from './skill-read-disclosure-error';

type Snapshot=Parameters<typeof runSkillCandidateArm>[0];
const knowledgeTools=new Set(['knowledge_search','knowledge_facts','knowledge_compare','knowledge_originals','vectorless_read']);
const denied=()=>new SkillReadDisclosureError();
const locatorKeys=new Set(['id','assetId','asset_id','documentId','document_id','chunkId','chunk_id','nodeId','node_id','releaseId','release_id',
 'versionId','version_id','sourceRevisionId','source_revision_id','sourceUnitId','source_unit_id','entityId','entity_id']);
const hashKeys=new Set(['sha256','sourceSha256','source_sha256','contentHash','content_hash','content_sha256']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function disclosureScanValue(value:unknown,key='',depth=0):unknown{
 if(depth>64)throw denied();
 if(typeof value==='string'){
  if(locatorKeys.has(key)&&uuid.test(value)||hashKeys.has(key)&&/^[a-f0-9]{64}$/i.test(value))return '[system evidence locator]';
  if(key==='url'&&value.startsWith('/api/knowledge/assets/')&&uuid.test(value.slice('/api/knowledge/assets/'.length)))return '[system evidence locator]';
  return value;
 }
 if(Array.isArray(value))return value.map(item=>disclosureScanValue(item,'',depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,disclosureScanValue(item,field,depth+1)]));
 return value;
}

/** Structural subsets retain field paths and complete array records. Strings
 * must match completely; matching a substring or a value in another field is
 * not disclosure permission. This never grants a model call or paid budget. */
export function isDisclosedReadSubset(value:unknown,previous:unknown){
 let remaining=50000;
 const equal=(next:unknown,prior:unknown,depth:number):boolean=>{
  if(--remaining<0||depth>64)return false;
  if(next===prior)return true;
  if(Array.isArray(next))return Array.isArray(prior)&&next.length===prior.length&&next.every((item,index)=>equal(item,prior[index],depth+1));
  if(!next||!prior||typeof next!=='object'||typeof prior!=='object'||Array.isArray(prior))return false;
  const keys=Object.keys(next);return keys.length===Object.keys(prior).length&&keys.every(key=>Object.hasOwn(prior,key)&&equal((next as Record<string,unknown>)[key],(prior as Record<string,unknown>)[key],depth+1));
 };
 const subset=(next:unknown,prior:unknown,depth:number):boolean=>{
  if(--remaining<0||depth>64)return false;
  if(next===prior)return true;
  if(Array.isArray(next)){
   if(!Array.isArray(prior))return false;
   const used=new Set<number>();
   return next.every(item=>{const index=prior.findIndex((old,index)=>!used.has(index)&&equal(item,old,depth+1));if(index<0)return false;used.add(index);return true;});
  }
  if(!next||!prior||typeof next!=='object'||typeof prior!=='object'||Array.isArray(prior))return false;
  return Object.keys(next).every(key=>Object.hasOwn(prior,key)&&subset((next as Record<string,unknown>)[key],(prior as Record<string,unknown>)[key],depth+1));
 };
 return subset(value,previous,0);
}
function comparable(output:unknown){
 const body={...toolResultSchema.parse(output)};delete body.callId;
 return JSON.parse(toolModelView([{role:'tool',tool_call_id:'disclosure',content:JSON.stringify(body)}])[0].content!);
}

/** Delta boundary for captured prospective reads. Existing task/Skill payload
 * authorization and financial admission remain separate. A new private result
 * is not authorized merely because the account can read it. */
export async function assertSkillRuntimeModelDisclosure(context:{userId:string},messages:ModelMessage[],snapshot:Snapshot){
 for(const row of snapshot.receipts)if(row.hash!==digest({tool:row.tool,arguments:row.arguments,output:row.output}))throw denied();
 const calls=new Map<string,{tool:string;arguments:Record<string,unknown>}>();
 for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
  if(call.function.name==='execute_tool')calls.set(call.id,z.object({tool:z.string(),arguments:z.record(z.string(),z.unknown())}).strict().parse(JSON.parse(call.function.arguments)));
 }
 for(const message of messages){
  const call=message.role==='tool'?calls.get(message.tool_call_id??''):undefined;if(!call)continue;
  // This frozen virtual overlay already belongs to the selected trial. Other
  // Skills remain private evidence subject to the same delta check as reads.
  if(call.tool==='skill_list'||call.tool==='skill_read'&&call.arguments.id===snapshot.candidate.listing.id)continue;
  const output=toolResultSchema.parse(JSON.parse(message.content??'null')),body=comparable(output);
  if(snapshot.receipts.some(row=>row.tool===call.tool&&isDisclosedReadSubset(body,comparable(row.output))))continue;
  if(!knowledgeTools.has(call.tool))throw denied();
  // As with ordinary public RAG disclosure, typed evidence locators are not
  // free text. This copy is scanned only; outbound model input is never changed.
  const scrubbed=preparePublicReviewDisclosure(disclosureScanValue(body));
  if(Object.values(scrubbed.redactionCounts).some(count=>count>0))throw denied();
  await tenantTransaction(context.userId,async client=>{
   await client.query('select lock_skill_knowledge_sources()');
   const assets=await resolveLockedSkillKnowledgeReceiptAssets(client,context.userId,[{tool:call.tool,output}]);
   if(!assets.assetIds.length||assets.databaseOnlyCount)throw denied();
   const rows=(await client.query<{id:string}>(`select a.id from knowledge_asset a join knowledge_document d on d.id=a.document_id
    where a.id=any($1::uuid[]) and a.registration_status='registered' and a.externally_disclosable
     and a.source_nature like 'public-%' and d.visibility='shared' and d.status='active' for share of a,d`,[assets.assetIds])).rows;
   if(rows.length!==assets.assetIds.length||new Set(rows.map(row=>row.id)).size!==assets.assetIds.length||rows.some(row=>!assets.assetIds.includes(row.id)))throw denied();
  });
 }
}
