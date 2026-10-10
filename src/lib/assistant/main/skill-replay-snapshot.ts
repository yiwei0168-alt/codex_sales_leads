import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest,toolResultSchema,type ExecutionContext,type ModelMessage} from './contracts';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';
import {assertCurrentKnowledgeMessages} from './knowledge-message-guard';
import {skillReplaySuiteSchema,runSkillReplay,type ReplayPair} from './skill-replay';
import {localReplayModel} from './skill-replay-local';

export const historicalSkillReplayInput=z.object({skillId:z.uuid(),version:z.number().int().positive(),
  runIds:z.array(z.uuid()).min(1).max(20).refine(ids=>new Set(ids).size===ids.length)}).strict();
type SnapshotInput=z.infer<typeof historicalSkillReplayInput>;
const supported=new Set(['knowledge_search','knowledge_compare','vectorless_read']);
const model={name:'qwen3:8b' as const,digest:'500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41'};
type Call={id:string;tool_id:string;tool_version:string;effect:string;status:string;input_hash:string;input:Record<string,unknown>;output:unknown};

/** Internal service: caller supplies the authenticated account, never a model-selected owner. */
export async function prepareHistoricalSkillReplay(context:Pick<ExecutionContext,'userId'>,input:SnapshotInput){
  const p=historicalSkillReplayInput.parse(input);
  const snapshot=await tenantTransaction(context.userId,async client=>{
    const version=(await client.query<SourcedSkillVersion&{dependencies:unknown}>(`select v.source,v.validation,v.content_hash,v.files,v.dependencies,s.scope,s.owner_id
      from agent_skill s join agent_skill_version v on v.skill_id=s.id
      join app_user u on u.id=s.owner_id and u.status='active'
      where s.id=$1 and s.owner_id=$2 and v.version=$3 and s.scope='account'`,[p.skillId,context.userId,p.version])).rows[0];
    if(!version||!Array.isArray(version.dependencies)||version.dependencies.length
      ||digest(version.files)!==version.content_hash||!await skillSourcesCurrent(client,context.userId,version))throw new Error('Skill snapshot unavailable');
    const cases=[],bindings=[],evidenceGroups:Array<{messages:ModelMessage[];scope?:Array<'industry'|'company'|'product'>}>=[];
    for(const runId of p.runIds){
      const run=(await client.query<{content:string;message_id:string;input:Record<string,unknown>}>(`select r.input,m.content,m.id as message_id
        from agent_run r join lateral(select id,content from assistant_message where user_id=r.user_id
          and conversation_id=r.conversation_id and role='user' and metadata->>'runId'=r.id::text order by created_at,id limit 1) m on true
        where r.id=$1 and r.user_id=$2 and r.status='completed' and r.execution_kind='main-agent'`,[runId,context.userId])).rows[0];
      if(!run||run.input.content!==run.content)throw new Error('Historical task unavailable or source changed');
      const scope=z.array(z.enum(['industry','company','product'])).min(1).max(3).optional().parse(run.input.knowledgeScope);
      const messages:ModelMessage[]=[];
      const calls=(await client.query<Call>(`select id,tool_id,tool_version,effect,status,input_hash,input,output from agent_tool_call
        where user_id=$1 and run_id=$2 order by created_at,id limit 25`,[context.userId,runId])).rows;
      if(!calls.length||calls.length>24)throw new Error('Historical task receipt count unsupported');
      const receipts=[];
      for(const call of calls){
        if(!supported.has(call.tool_id)||call.tool_version!=='1'||call.effect!=='read'||call.status!=='completed'
          ||digest(call.input)!==call.input_hash)throw new Error('Historical task contains unsupported or invalid receipts');
        const output=toolResultSchema.parse(call.output);
        if(!['success','partial'].includes(output.status))throw new Error('Historical receipt is not completed evidence');
        // Fail closed on absent or malformed evidence envelopes, rather than letting the guard see zero sources.
        if(call.tool_id==='knowledge_search')z.array(z.object({id:z.uuid(),content:z.string()})).min(1).parse(output.data);
        if(call.tool_id==='knowledge_compare')z.object({kind:z.literal('comparison-evidence'),entities:z.array(z.object({
          evidence:z.array(z.object({id:z.uuid(),content:z.string()})),verifiedFacts:z.array(z.object({id:z.uuid(),chunkId:z.uuid()}))})).length(2)})
          .refine(data=>data.entities.some(e=>e.evidence.length||e.verifiedFacts.length)).parse(output.data);
        if(call.tool_id==='vectorless_read')z.object({evidence:z.object({id:z.uuid(),content:z.string(),source_sha256:z.string(),source_location:z.unknown()})}).parse(output.data);
        messages.push({role:'assistant',content:null,tool_calls:[{id:call.id,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:call.tool_id,arguments:call.input})}}]},
          {role:'tool',tool_call_id:call.id,content:JSON.stringify(call.output)});
        const receipt={tool:call.tool_id,arguments:call.input,result:call.output};
        receipts.push({...receipt,sha256:digest(receipt)});
      }
      cases.push({id:`history-${runId}`,category:'replay' as const,provenance:'historical' as const,sourceRunId:runId,question:run.content,receipts});
      evidenceGroups.push({messages,scope});
      bindings.push({runId,messageId:run.message_id,messageHash:digest(run.content),inputHash:digest(run.input),
        calls:calls.map(call=>({id:call.id,inputHash:call.input_hash,outputHash:digest(call.output)}))});
    }
    const suite=skillReplaySuiteSchema.parse({id:`skill-history-${p.skillId}-v${p.version}`,ownerId:context.userId,
      skill:{id:p.skillId,version:p.version,files:version.files,contentHash:version.content_hash,
        sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})},model,cases});
    return {suite,bindings,evidenceGroups};
  });
  // This guard re-reads current ACL, document/release hashes, raw content and verified-fact state.
  for(const group of snapshot.evidenceGroups)await assertCurrentKnowledgeMessages(context.userId,group.messages,group.scope);
  return {suite:snapshot.suite,bindings:snapshot.bindings,bindingHash:digest(snapshot.bindings),suiteHash:digest(snapshot.suite)};
}

/** Revalidate before/after every model call and before persisting a pair. Never consumes a disk-supplied snapshot. */
export async function runHistoricalSkillReplay(context:Pick<ExecutionContext,'userId'>,input:SnapshotInput,
  persistManifest:(snapshot:Awaited<ReturnType<typeof prepareHistoricalSkillReplay>>)=>Promise<void>,
  persistPair:(pair:ReplayPair)=>Promise<void>){
  const original=await prepareHistoricalSkillReplay(context,input);
  await persistManifest(original);
  const assertCurrent=async()=>{
    const now=await prepareHistoricalSkillReplay(context,input);
    if(now.suiteHash!==original.suiteHash||now.bindingHash!==original.bindingHash)throw new Error('Historical snapshot changed');
  };
  const local=await localReplayModel(process.env.OLLAMA_LOCAL_URL||'http://127.0.0.1:11434',model.digest);
  let invalidated=false;
  try{
    const result=await runSkillReplay(original.suite,async messages=>{
      if(invalidated)throw new Error('Historical snapshot changed');
      try{await assertCurrent();}catch(error){invalidated=true;throw error;}
      const response=await local.generate(messages);
      try{await assertCurrent();}catch(error){invalidated=true;throw error;}
      return response;
    },async pair=>{if(invalidated)throw new Error('Historical snapshot changed');await assertCurrent();await persistPair(pair);});
    await assertCurrent();return result;
  }finally{await local.close();}
}
