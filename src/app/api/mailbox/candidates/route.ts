import { requireApiSession } from "@/lib/auth/session";
import {listPendingMailboxCandidates} from "@/lib/mailbox/candidate-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const page=Math.max(1,Math.min(100000,Number(new URL(request.url).searchParams.get("page"))||1));
  const pageSize=8;
  return Response.json({ candidates: await listPendingMailboxCandidates(session.userId,(page-1)*pageSize,pageSize),page,pageSize });
}
