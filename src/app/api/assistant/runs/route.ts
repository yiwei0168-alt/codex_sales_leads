import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { listRuns } from "@/lib/assistant/main/repository";
import {withApprovalTargets} from '@/lib/assistant/main/approval-targets';
export async function GET(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const id = new URL(request.url).searchParams.get("conversationId") ?? undefined;
  if (id && !z.uuid().safeParse(id).success) return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  try {
    const runs=await listRuns(session.userId,id);
    const approvals=await withApprovalTargets(session.userId,runs.flatMap(run=>run.approvals??[]));
    const byId=new Map(approvals.map(approval=>[approval.id,approval]));
    return Response.json({enabled:true,runs:runs.map(run=>({...run,approvals:(run.approvals??[]).map(approval=>byId.get(approval.id)??approval)}))},{headers:{'Cache-Control':'private, no-store'}});
  }
  catch { return Response.json({ error: "任务服务暂不可用" }, { status: 503 }); }
}
