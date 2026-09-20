import { requireApiSession } from "@/lib/auth/session";
import { updateCompanyState } from "@/lib/sales/repository";
import type { CompanyEditablePatch } from "@/lib/sales/types";
import {companyStatePatchSchema} from "@/lib/sales/company-state-input";
import {z} from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ externalId: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let submitted: unknown;
  try { submitted = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const revision=z.number().int().min(0).safeParse(typeof submitted==="object"&&submitted!==null&&"expectedRevision" in submitted?submitted.expectedRevision:undefined);
  if(!revision.success)return Response.json({error:"请刷新公司状态后再保存"},{status:409});
  const patch=typeof submitted==="object"&&submitted!==null&&!Array.isArray(submitted)?Object.fromEntries(Object.entries(submitted).filter(([key])=>key!=="expectedRevision")):submitted;
  const parsed=companyStatePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return Response.json({ error: "No supported company fields supplied" }, { status: 400 });
  }
  const body:CompanyEditablePatch=parsed.data;
  const { externalId } = await params;
  try {
    const company = await updateCompanyState(externalId, body, session.userId,revision.data);
    return Response.json({ updated: true, company });
  } catch (error) {
    if(error instanceof Error&&error.message.startsWith("Company state changed"))return Response.json({error:"公司状态已有新修改，请刷新后重新检查"},{status:409});
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 404 });
  }
}
