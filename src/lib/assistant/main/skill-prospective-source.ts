import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {digest} from './contracts';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';
import {requireSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {prepareSkillShadow} from './skill-shadow';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

type CaptureRow={id:string;run_id:string;campaign_id:string;start_context:unknown;
 registered_at:Date;captured_at:Date;task_started_at:Date|null;ready_at:Date|null;
 task_input:unknown;model_config:unknown};
/** Bind a planned shadow case to the server's pre-task capture, not a retrospective
 * local-model comparison. This performs no model call and does not create observations. */
export async function prepareSkillProspectiveSource(context:{userId:string},input:unknown){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);
 const p=z.object({jobId:z.uuid(),freezeId:z.uuid(),caseId:z.string().min(1).max(200),
  plan:skillAcceptancePlanSchema}).strict().parse(input);
 const plan=p.plan,item=plan.cases.find(row=>row.id===p.caseId);
 if(plan.pin.ownerId!==context.userId||!item||item.category!=='shadow'||item.provenance!=='prospective-task')
  throw new Error('Prospective case or owner invalid');
 await requireSkillAcceptanceFreeze(context,p.freezeId,plan);
 const read=async()=>{
  const rows=await tenantQuery<CaptureRow>(context.userId,`select j.id,j.run_id,j.campaign_id,j.start_context,
   c.created_at as registered_at,j.created_at as captured_at,j.ready_at,r.input as task_input,r.model_config,
   (select min(t.created_at) from agent_tool_call t where t.user_id=j.owner_id and t.run_id=j.run_id
    and t.tool_id='main_model' and t.effect='model') as task_started_at
   from agent_skill_shadow_job j join agent_skill_shadow_campaign c on c.id=j.campaign_id and c.owner_id=j.owner_id
   join agent_run r on r.id=j.run_id and r.user_id=j.owner_id
   where j.id=$1 and j.owner_id=$2 and c.skill_id=$3 and c.version=$4
    and r.execution_kind='main-agent' and r.status='completed'`,
  [p.jobId,context.userId,plan.pin.skillId,plan.pin.version]);
  if(rows.length!==1)throw new Error('Prospective capture unavailable');
  return rows[0];
 };
 const before=await read(),frozen=Date.parse(plan.frozenAt),expires=Date.parse(plan.expiresAt);
 const start=z.object({skillId:z.uuid(),version:z.number().int().positive(),
  contentHash:z.string(),sourceHash:z.string()}).passthrough().parse(before.start_context);
 if(start.skillId!==plan.pin.skillId||start.version!==plan.pin.version
  ||start.contentHash!==plan.pin.contentHash||start.sourceHash!==plan.pin.sourceHash)
  throw new Error('Prospective Skill binding changed');
 const registered=before.registered_at.getTime(),captured=before.captured_at.getTime();
 const started=before.task_started_at?.getTime(),completed=before.ready_at?.getTime();
 if(!Number.isFinite(registered)||!Number.isFinite(captured)||started===undefined||completed===undefined
  ||!Number.isFinite(started)||!Number.isFinite(completed)
  ||!(registered<=frozen&&frozen<=captured&&captured<=started&&started<=completed&&completed<expires))
  throw new Error('Prospective capture was not frozen before task execution');
 if(digest(before.task_input)!==item.inputHash||digest(before.start_context)!==item.sourceHash
  ||digest(before.model_config)!==plan.identity.modelConfigHash)throw new Error('Prospective task binding changed');
 const shadow=await prepareSkillShadow({userId:context.userId,jobId:p.jobId});
 if(shadow.capture.jobId!==before.id||shadow.capture.runId!==before.run_id||shadow.capture.campaignId!==before.campaign_id
  ||digest(shadow.capture.start)!==digest(before.start_context)
  ||shadow.config.selection.kind!=='whole-read-only-task')throw new Error('Prospective capture selection changed');
 const pinned=z.object({pinnedSkills:z.array(z.object({skillId:z.uuid(),version:z.number().int().positive()}).passthrough())})
  .passthrough().parse(shadow.capture.final).pinnedSkills;
 if(pinned.some(row=>row.skillId===plan.pin.skillId))throw new Error('Prospective baseline already used the evaluated Skill');
 // Existing shadow preparation rechecks current Skill/source permissions, completed
 // source receipts, immutable capture and unsupported added instructions. Its local
 // model output is deliberately not used as either production arm here.
 if(digest(await read())!==digest(before))throw new Error('Prospective capture changed during validation');
 if(digest(await prepareSkillShadow({userId:context.userId,jobId:p.jobId}))!==digest(shadow))
  throw new Error('Prospective source changed during validation');
 await requireSkillAcceptanceFreeze(context,p.freezeId,plan);
 const projection={protocol:'skill-prospective-source-v1',ownerId:context.userId,
  jobId:p.jobId,campaignId:before.campaign_id,runId:before.run_id,freezeId:p.freezeId,
  caseId:p.caseId,planHash:digest(plan),inputHash:item.inputHash,sourceHash:item.sourceHash,
  capturedAt:before.captured_at.toISOString(),taskStartedAt:before.task_started_at!.toISOString(),
  taskCompletedAt:before.ready_at!.toISOString(),snapshotHash:digest(shadow.snapshot),evaluatedSkillAbsentFromBaseline:true};
 return {projection,projectionHash:digest(projection),prospectiveCaptureVerified:true as const,
  localComparisonPromoted:false as const,productionAgentEquivalent:false as const,automaticActivation:false as const};
}
