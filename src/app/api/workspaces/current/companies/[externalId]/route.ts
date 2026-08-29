import { requireApiSession } from "@/lib/auth/session";
import { updateCompanyState } from "@/lib/sales/repository";
import type { CompanyEditablePatch } from "@/lib/sales/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedKeys = new Set(["accountTier", "supplyModel", "brandInvolvement", "opportunityStage", "priority", "owner", "nextAction", "selectedPathId"]);
const allowedValues = {
  accountTier: new Set(["Strategic Distributor", "Priority Distributor", "Standard Distributor", "Long-tail Distributor",
    "KA", "Priority", "Standard", "Long-tail"]),
  supplyModel: new Set(["Distributor Supply", "Brand Direct", "Co-sell/Co-supply", "TBD"]),
  brandInvolvement: new Set(["Light", "Standard", "Deep"]),
  opportunityStage: new Set(["Discovered", "Qualified", "Priority", "Contact Prepared", "Engaged", "Excluded"]),
  priority: new Set(["High", "Medium", "Low"]),
};

export async function PATCH(request: Request, { params }: { params: Promise<{ externalId: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let body: CompanyEditablePatch;
  try { body = await request.json() as CompanyEditablePatch; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!body || Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return Response.json({ error: "No supported company fields supplied" }, { status: 400 });
  }
  for (const [key, values] of Object.entries(allowedValues)) {
    const value = body[key as keyof CompanyEditablePatch];
    if (value !== undefined && (typeof value !== "string" || !values.has(value))) return Response.json({ error: `Invalid ${key}` }, { status: 400 });
  }
  if ((body.owner !== undefined && (typeof body.owner !== "string" || body.owner.length > 200)) ||
      (body.nextAction !== undefined && (typeof body.nextAction !== "string" || body.nextAction.length > 2000)) ||
      (body.selectedPathId !== undefined && (typeof body.selectedPathId !== "string" || body.selectedPathId.length > 80))) {
    return Response.json({ error: "Invalid text field" }, { status: 400 });
  }
  const { externalId } = await params;
  try {
    await updateCompanyState(externalId, body, session.userId);
    return Response.json({ updated: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 404 });
  }
}
