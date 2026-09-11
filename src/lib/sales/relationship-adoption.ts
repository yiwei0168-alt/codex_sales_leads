import type { PoolClient } from "pg";

/** Same transaction as saving the relationship; an index is stable in the unfiltered cached output. */
export async function recordRelationshipAdoption(client:PoolClient,userId:string,workspaceId:string,country:string,fromId:string,toId:string,selection:{analysisId:string;suggestionIndex:number},decision:string){
  const row=await client.query<{result:{suggestions:unknown[]};metrics:Record<string,unknown>}>(
    `select result,metrics from user_relationship_analysis where id=$1 and user_id=$2 and workspace_id=$3
      and country_code=$4 and from_company_id=$5 and to_company_id=$6 and status='completed' for update`,
    [selection.analysisId,userId,workspaceId,country,fromId,toId]);
  const saved=row.rows[0];
  if(!saved||!saved.result?.suggestions?.[selection.suggestionIndex])throw new Error("关系建议来源失效，请重新读取存量分析");
  const used=Array.isArray(saved.metrics.usedSuggestionIndices)?saved.metrics.usedSuggestionIndices.filter((item):item is number=>Number.isInteger(item)):[];
  const indices=[...new Set([...used,selection.suggestionIndex])].sort((a,b)=>a-b);
  await client.query(`update user_relationship_analysis set metrics=metrics || $3::jsonb,updated_at=now() where id=$1 and user_id=$2`,
    [selection.analysisId,userId,JSON.stringify({usedSuggestionIndices:indices,downstreamUsedItems:indices.length,
      lastUserDecision:decision,usageBoundary:"suggestion-used-in-user-saved-relationship-not-proof-of-cooperation",
      downstreamUtilizationEfficiency:saved.result.suggestions.length?indices.length/saved.result.suggestions.length:null})]);
}
