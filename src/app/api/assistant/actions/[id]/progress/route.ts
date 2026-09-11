import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { readWorkflowCheckpointProgress } from "@/lib/leads/workflow/graph";
import { requestWorkflowPause } from "@/lib/leads/workflow/jobs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;if(!z.uuid().safeParse(id).success)return Response.json({error:"任务 ID 无效"},{status:400});
  const rows=await tenantQuery<{graph_thread_id:string;status:string;phase:string;attempts:number;stop_requested:boolean;paused_at:string|null;updated_at:string}>(session.userId,
    `select graph_thread_id,status,phase,attempts,stop_requested,paused_at::text,updated_at::text from lead_workflow_job where user_id=$1 and action_id=$2`,[session.userId,id]);
  if(!rows[0])return Response.json({job:null,progress:null});
  try{const {graph_thread_id,...job}=rows[0];return Response.json({job,progress:await readWorkflowCheckpointProgress(session.userId,id,graph_thread_id)});}
  catch{return Response.json({error:"阶段记录暂不可读取；未重新执行任务"},{status:503});}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;if(!z.uuid().safeParse(id).success)return Response.json({error:"任务 ID 无效"},{status:400});
  const body=await request.json().catch(()=>null);if(body?.action!=="pause")return Response.json({error:"仅支持暂停"},{status:400});
  return await requestWorkflowPause(session.userId,id)?Response.json({requested:true}):Response.json({error:"任务已经结束或不可暂停"},{status:409});
}
