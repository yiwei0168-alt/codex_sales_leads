import {tenantTransaction} from '@/lib/rag/db';
import {digest,type ExecutionContext,type ModelMessage} from './contracts';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';

export const SKILL_CHANGED_REPLY='本任务使用的 Skill 已停用、权限或经验来源已变化，或暂时无法复核。已停止使用旧方法和执行后续操作，请重新发起任务以读取当前版本。';
export class SkillContextChangedError extends Error {constructor(){super('Pinned Skill context validation failed');}}
type Pinned=SourcedSkillVersion&{skill_id:string;version:number;dependencies:unknown;enabled:boolean;published:boolean};
const fingerprint=(s:Pinned)=>digest({skill_id:s.skill_id,version:s.version,source:s.source,files:s.files,
  content_hash:s.content_hash,dependencies:s.dependencies,validation:s.validation,scope:s.scope,owner_id:s.owner_id});

/** Stop the task rather than trying to remove every conclusion derived from withdrawn instructions. */
export async function assertCurrentSkillMessages(context:Pick<ExecutionContext,'userId'|'runId'>,messages:ModelMessage[]){
  try{
    await tenantTransaction(context.userId,async client=>{
      const pins=(await client.query<Pinned>(`select p.skill_id,p.version,v.source,v.files,v.content_hash,v.dependencies,v.validation,
          s.scope,s.owner_id,s.enabled,s.published
        from agent_run_skill p left join agent_skill_version v on v.skill_id=p.skill_id and v.version=p.version
        left join agent_skill s on s.id=p.skill_id
        where p.user_id=$1 and p.run_id=$2`,[context.userId,context.runId])).rows;
      for(const pin of pins){
        if(!pin.enabled||!(pin.owner_id===context.userId||(pin.scope==='global'&&pin.published))
          ||!pin.files||digest(pin.files)!==pin.content_hash||!await skillSourcesCurrent(client,context.userId,pin))
          throw new SkillContextChangedError();
      }
      const calls=new Map<string,string>();
      for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
        if(call.function.name!=='execute_tool')continue;
        try{const input=JSON.parse(call.function.arguments);if(input.tool==='skill_read')calls.set(call.id,input.arguments?.id);}catch{/* Not executable. */}
      }
      for(const message of messages){
        if(message.role!=='tool'||!calls.has(message.tool_call_id??''))continue;
        const output=JSON.parse(message.content??'{}');if(output.data===null||output.data===undefined)continue;
        const expectedId=calls.get(message.tool_call_id!),saved=output.data as Pinned;
        const pin=pins.find(p=>p.skill_id===expectedId&&p.version===saved.version);
        if(!pin||saved.skill_id!==expectedId||fingerprint(pin)!==fingerprint(saved))throw new SkillContextChangedError();
      }
    });
  }catch{throw new SkillContextChangedError();}
}
