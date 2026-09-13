import type { PoolClient } from "pg";
import { correctionCompletion } from "./correction-completion";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment } from "./types";

export function artifactObservations(input:{candidates:CorrectedLeadWorkflowCandidate[];assessments:LeadCandidateAssessment[];savedCount:number;countryCode:string}){
  const events=[
    {stage:"discover_candidates",artifactType:"candidate",eventType:"generated",count:input.candidates.length},
    {stage:"correct_candidates",artifactType:"candidate",eventType:"valid",count:input.candidates.filter(candidate=>correctionCompletion(candidate.correction)==="completed").length},
    {stage:"collect_evidence",artifactType:"public-evidence",eventType:"retrieved",count:input.candidates.flatMap(candidate=>candidate.evidence).filter(item=>item.sourceType!=="discovery").length},
    {stage:"score_candidates",artifactType:"public-evidence",eventType:"cited",count:new Set(input.assessments.flatMap(assessment=>assessment.evidenceIds)).size},
    {stage:"score_candidates",artifactType:"assessment",eventType:"decision-used",count:input.assessments.filter(assessment=>assessment.scoringStatus==="completed").length},
    {stage:"persist_results",artifactType:"candidate",eventType:"saved",count:input.savedCount},
    {stage:"persist_results",artifactType:"candidate",eventType:"delivery-selected",count:input.savedCount},
  ];
  return events.map(event=>({...event,metadata:{observationVersion:"workflow-artifact-v2",actor:"system",
    observationBoundary:"committed-result-input-and-delivery",countryCode:input.countryCode,
    // Stored run inputs are not the entire original discovery funnel or a UI observation.
    population:"final-run-persistence-input",userAdoptedItems:null,uiViewedItems:null}}));
}

export async function saveArtifactObservations(client:PoolClient,scope:{userId:string;workspaceId:string;runId:string;actionId:string;graphThreadId:string},
  events:ReturnType<typeof artifactObservations>){
  for(const event of events){
    const inserted=await client.query(`insert into workflow_artifact_event
      (user_id,workspace_id,lead_run_id,action_id,graph_thread_id,stage,artifact_type,event_type,artifact_count,metadata)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      on conflict(user_id,lead_run_id,stage,artifact_type,event_type)
      where metadata->>'observationVersion'='workflow-artifact-v2' and lead_run_id is not null
      do nothing returning id`,[scope.userId,scope.workspaceId,scope.runId,scope.actionId,scope.graphThreadId,
      event.stage,event.artifactType,event.eventType,event.count,JSON.stringify(event.metadata)]);
    if(inserted.rows.length)continue;
    const existing=await client.query<{artifact_count:number;metadata:unknown}>(`select artifact_count,metadata from workflow_artifact_event
      where user_id=$1 and lead_run_id=$2 and stage=$3 and artifact_type=$4 and event_type=$5
        and metadata->>'observationVersion'='workflow-artifact-v2' and workspace_id=$6 and action_id=$7 and graph_thread_id=$8`,
      [scope.userId,scope.runId,event.stage,event.artifactType,event.eventType,scope.workspaceId,scope.actionId,scope.graphThreadId]);
    const row=existing.rows[0];
    const expected=event.metadata;
    if(!row||row.artifact_count!==event.count||Object.entries(expected).some(([key,value])=>(row.metadata as Record<string,unknown>)[key]!==value))
      throw new Error("Artifact observation conflicts with an already committed result");
  }
}
