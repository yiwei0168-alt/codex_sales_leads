import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { contactLookupProvider } from "@/providers/contact-lookup-factory";
import { lookupAndStoreContacts } from "@/lib/contacts/lookup-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const externalId = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    && "externalId" in parsed && typeof parsed.externalId === "string" ? parsed.externalId.trim() : "";
  const websiteUrl = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    && "websiteUrl" in parsed && typeof parsed.websiteUrl === "string" ? parsed.websiteUrl.trim() : "";
  let requestedDomain = "";
  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("unsupported protocol");
      requestedDomain = url.hostname.toLowerCase().replace(/^www\./, "");
    } catch { return Response.json({ error: "websiteUrl 无效" }, { status: 400 }); }
  }
  if ((!externalId && !requestedDomain) || externalId.length > 180 || requestedDomain.length > 253) {
    return Response.json({ error: "externalId 或 websiteUrl 至少需要一个有效值" }, { status: 400 });
  }
  const rows = await tenantQuery<{
    id: string; canonical_name: string; domain: string; country_code: string; external_id: string; workspace_id:string;
  }>(session.userId,
    `select company.id, company.canonical_name, company.domain, company.country_code, company.external_id,workspace.id as workspace_id
       from sales_company company
       join workspace_company workspace_company on workspace_company.company_id=company.id
       join market_workspace workspace on workspace.id=workspace_company.workspace_id
      where workspace.owner_id=$1 and workspace.slug='global-sales'
        and (($2::text <> '' and company.external_id=$2) or ($3::text <> '' and lower(company.domain)=$3))
      limit 1`,
    [session.userId, externalId, requestedDomain]);
  const company = rows[0];
  if (!company) return Response.json({ error: "候选公司不存在或不属于当前工作区" }, { status: 404 });
  if(!company.domain||company.domain.endsWith(".invalid"))return Response.json({error:"公司尚无已确认官网域名，不能查询联系人"},{status:400});
  const provider = contactLookupProvider();
  if (!provider.isConfigured()) {
    return Response.json({
      error: "联系方式查询接口已预留，但当前未启用。",
      provider: provider.id,
      requiredConfiguration: ["CONTACT_LOOKUP_ENABLED", "CONTACT_LOOKUP_PROVIDER", "SNOV_USER_ID", "SNOV_API_SECRET"],
    }, { status: 503 });
  }
  try {
    const saved = await lookupAndStoreContacts(session.userId,company.workspace_id,{
      companyId: company.id,
      companyName: company.canonical_name,
      websiteUrl: `https://${company.domain}/`,
      domain: company.domain,
      countryCode: company.country_code,
      targetRoles: ["Owner", "Founder", "CEO", "Procurement", "Purchasing", "Channel", "Sales", "Technical"],
    },provider,typeof parsed==="object"&&parsed!==null&&"refresh" in parsed&&parsed.refresh===true);
    return Response.json({ company: { externalId: company.external_id, name: company.canonical_name,
      websiteUrl: `https://${company.domain}/` }, ...saved });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "联系方式平台查询失败" }, { status: 502 });
  }
}
