import {tenantQuery} from "@/lib/rag/db";
import {z} from "zod";
import type {ExecutionContext,ModelMessage} from "./contracts";
/** Exact call IDs handle approved leaf actions whose key differs from a model tool ID. */
export async function recordConsumedToolOutputs(context:ExecutionContext,messages:ModelMessage[]) {
  const protocolIds:string[]=[],callIds:string[]=[];
  for(const message of messages) {
    if(message.role!=="tool")continue;
    if(message.tool_call_id)protocolIds.push(message.tool_call_id);
    try {const body=JSON.parse(message.content??"null");if(z.uuid().safeParse(body?.callId).success)callIds.push(body.callId);}catch{}
  }
  if(!protocolIds.length&&!callIds.length)return;
  await tenantQuery(context.userId,`update agent_tool_call set metrics=metrics||jsonb_build_object('downstreamUsedItems',1,'utilizationEfficiency',1,'usageBoundary','consumed-by-main-model')
    where user_id=$1 and run_id=$2 and (call_key=any($3::text[]) or id=any($4::uuid[])) and status='completed' and output->>'status' in('success','partial')`,[context.userId,context.runId,protocolIds,callIds]);
}
