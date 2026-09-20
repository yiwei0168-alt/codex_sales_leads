import { requireApiSession } from "@/lib/auth/session";
import { updateCompanyState } from "@/lib/sales/repository";
import type { CompanyEditablePatch } from "@/lib/sales/types";
import {companyStatePatchSchema} from "@/lib/sales/company-state-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ externalId: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let submitted: unknown;
  try { submitted = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed=companyStatePatchSchema.safeParse(submitted);
  if (!parsed.success) {
    return Response.json({ error: "No supported company fields supplied" }, { status: 400 });
  }
  const body:CompanyEditablePatch=parsed.data;
  const { externalId } = await params;
  try {
    const company = await updateCompanyState(externalId, body, session.userId);
    return Response.json({ updated: true, company });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 404 });
  }
}
