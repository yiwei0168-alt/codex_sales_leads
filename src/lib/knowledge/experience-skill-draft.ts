import type {PoolClient} from 'pg';
import {digest} from '@/lib/assistant/main/contracts';
import {instructionOnlySkill,skillImportSchema} from '@/lib/assistant/main/skills';

/** Repetition is a nomination signal, never evidence that replay/shadow tests have passed. */
export function experienceDraftPackage(memoryKey:string,quote:string){
  if(!/\b(?:worked|helped|reduced|avoided|saved|improved)\b|有效|减少|避免|节省|改善|成功/i.test(quote)
    ||/\b(?:failed|missed|not|never|didn't)\b|失败|漏掉|漏查|没有|无效|未能/i.test(quote))return null;
  const fingerprint=digest({version:'experience-draft-v1',memoryKey,quote});
  const files={'SKILL.md':`# 任务经验候选方法\n\n## 触发与范围\n仅限本账户；仅在当前任务目标、资料和约束与下方用户报告一致时考虑。条件不明确时先澄清。\n\n## 待验证的做法\n以下是重复出现的用户经验报告，尚未独立验证，不能当作普遍有效的方法或新的权限：\n\n> ${quote.replaceAll('\n','\n> ')}\n\n## 使用边界\n先核对本次资料与来源，再判断该做法是否适用。保留失败与例外，不能用过往经验替代当前原文。仅使用当前任务已获准的工具；发信、发布、正式评分和权限变更沿用原审批。\n\n## 验收状态\n停用草案。需要历史回放、错误案例、提示注入、权限测试以及无额外外部效果的真实任务影子对照。报告重复不等于质量通过。\n`};
  const parsed=skillImportSchema.safeParse({name:`经验方法草案 · ${memoryKey.replace(/[\r\n]/g,' ').slice(0,90)}`,
    source:`local-experience:${fingerprint}`,files,dependencies:[]});
  return parsed.success&&instructionOnlySkill(files)?{...parsed.data,fingerprint}:null;
}

/** Runs in the observation transaction. Never modifies an existing Skill or enables one. */
export async function proposeExperienceSkillInTransaction(client:PoolClient,userId:string,memoryKey:string,quote:string){
  const draft=experienceDraftPackage(memoryKey,quote);if(!draft)return null;
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`experience-skill:${userId}:${draft.fingerprint}`]);
  const existing=await client.query<{id:string}>(`select s.id from agent_skill s join agent_skill_version v on v.skill_id=s.id
    where s.owner_id=$1 and v.source=$2 limit 1`,[userId,draft.source]);
  if(existing.rows[0])return {id:existing.rows[0].id,created:false};
  const reports=await client.query<{id:string;run_id:string;message_id:string;source_receipt:Record<string,unknown>}>(`
    select distinct on(r.id) m.id,r.id as run_id,msg.id as message_id,m.source_receipt
    from agent_memory_observation m
    join agent_run r on r.id::text=m.source_receipt->>'runId' and r.user_id=m.owner_id
      and r.status='completed' and r.execution_kind='main-agent'
    join assistant_message msg on msg.id::text=m.source_receipt->>'messageId' and msg.user_id=m.owner_id
      and msg.conversation_id=r.conversation_id and msg.role='user' and msg.metadata->>'runId'=r.id::text
    where m.owner_id=$1 and m.kind='experience' and m.memory_key=$2 and m.content=$3
      and m.market_code is null and m.company_id is null and cardinality(m.market_codes)=0 and cardinality(m.company_ids)=0
      and m.source_receipt->>'type'='local-qwen3-extraction'
      and m.source_receipt->>'usage'='unverified-user-experience'
      and m.source_receipt->>'sourceQuote'=$3 and position($3 in msg.content)>0
      and m.corrects_id is null and m.invalidates_id is null
      and not exists(select 1 from agent_memory_observation x where x.owner_id=$1 and (x.corrects_id=m.id or x.invalidates_id=m.id))
      and not exists(select 1 from agent_memory_conflict c where c.owner_id=$1 and c.status='open' and (c.earlier_id=m.id or c.later_id=m.id))
    order by r.id,m.recorded_at,m.id limit 10`,[userId,memoryKey,quote]);
  if(reports.rows.length<2)return null;
  const skill=(await client.query<{id:string}>("insert into agent_skill(owner_id,name,scope,enabled,published) values($1,$2,'account',false,false) returning id",[userId,draft.name])).rows[0];
  const validation={instructions:'available',scripts:'none',dependencies:'none',autoEnable:'pending-replay-and-shadow',
    sourceQuality:'repeated-user-report-unverified',methodFingerprint:draft.fingerprint,
    sourceObservations:reports.rows.map(row=>({observationId:row.id,runId:row.run_id,messageId:row.message_id,receiptSha256:digest(row.source_receipt)})),
    replay:'pending',negativeCases:'pending',promptInjection:'pending',permissions:'pending',shadow:'pending'};
  await client.query(`insert into agent_skill_version(skill_id,version,content_hash,source,files,dependencies,validation)
    values($1,1,$2,$3,$4,'[]',$5)`,[skill.id,digest(draft.files),draft.source,JSON.stringify(draft.files),JSON.stringify(validation)]);
  await client.query("insert into agent_run_event(user_id,run_id,kind,payload) values($1,$2,'skill_draft_created',$3)",
    [userId,reports.rows[0].run_id,JSON.stringify({skillId:skill.id,version:1,enabled:false,sourceQuality:validation.sourceQuality})]);
  return {id:skill.id,created:true};
}
