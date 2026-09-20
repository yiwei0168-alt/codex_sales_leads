import { requireApiSession } from "@/lib/auth/session";
import {listPendingMailboxCandidates} from "@/lib/mailbox/candidate-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  return Response.json({ candidates: await listPendingMailboxCandidates(session.userId) });
}
