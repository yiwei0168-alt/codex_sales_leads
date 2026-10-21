import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { listApprovals } from "@/lib/assistant/main/approvals";
import { getRun } from "@/lib/assistant/main/repository";
import {withApprovalTargets} from '@/lib/assistant/main/approval-targets';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid run" }, { status: 400 });
  if (!await getRun(session.userId, id)) return Response.json({ error: "Not found" }, { status: 404 });
  try{
    const approvals=await withApprovalTargets(session.userId,await listApprovals(session.userId,id));
    return Response.json({approvals},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'审批内容暂时无法核对，请稍后重试'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
