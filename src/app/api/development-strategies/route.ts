import { requireApiSession } from "@/lib/auth/session";
import { runDevelopmentStrategyAgent } from "@/lib/outreach/graph";
import { tenantQuery } from "@/lib/rag/db";
import type { DevelopmentStrategyDto } from "@/lib/outreach/types";
import type { CompanyRecord } from "@/lib/domain";
import { developmentContextVersion } from "@/lib/outreach/context-version";
import { developmentDependencyVersion } from "@/lib/outreach/dependency-version";

export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const company=new URL(request.url).searchParams.get("company")??"";
  if(!company||company.length>180)return Response.json({error:"公司参数无效"},{status:400});
  const rows=await tenantQuery<{result:DevelopmentStrategyDto;context_version:string|null;dependency_version:string|null;record:CompanyRecord}>(session.userId,`select d.input_snapshot->>'contextVersion' as context_version,d.input_snapshot->>'dependencyVersion' as dependency_version,
    wc.record,jsonb_build_object(
    'id',d.id,'companyExternalId',wc.candidate_id,'strategy',d.strategy,'status',d.status,'revision',d.revision,
    'draft',jsonb_build_object('language',d.language,'subjectOptions',d.subject_options,'body',coalesce(d.manual_body,d.body),'wordCount',0,'placeholders','[]'::jsonb),
    'evidenceIds',d.evidence_ids,'knowledgeIds',d.knowledge_chunk_ids,'templateIds',d.template_ids,'warnings',d.warnings,
    'model',d.model,'promptVersion',d.prompt_version,'generationMetrics',d.generation_metrics,'createdAt',d.created_at) as result
    from outreach_draft d join user_company_market wc on wc.company_id=d.company_id and wc.workspace_id=d.workspace_id and wc.market_country_code=d.market_country_code where d.user_id=$1 and wc.candidate_id=$2
    and d.status in ('generated','approved','sent') order by d.updated_at desc,d.id desc limit 1`,[session.userId,company]);
  const result=rows[0]?.result??null;if(result)result.draft.wordCount=result.draft.body.split(/\s+/).filter(Boolean).length;
  if(result)result.contextReview=!rows[0].context_version?"legacy-unknown":rows[0].context_version===developmentContextVersion(rows[0].record)?"current":"changed";
  if(result&&result.contextReview!=="changed")result.contextReview=!rows[0].dependency_version||!rows[0].context_version?"legacy-unknown":rows[0].dependency_version===await developmentDependencyVersion(session.userId)?"current":"changed";
  return Response.json({result},{headers:{"Cache-Control":"private, no-store"}});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed as Record<string, unknown>;
  const companyExternalId = typeof body.companyExternalId === "string" ? body.companyExternalId.trim() : "";
  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : undefined;
  const language = typeof body.language === "string" ? body.language.trim() : "en";
  const tone = typeof body.tone === "string" ? body.tone.trim() : undefined;
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : undefined;
  const targetLength = typeof body.targetLength === "number" ? Math.round(body.targetLength) : undefined;
  if (!companyExternalId || companyExternalId.length > 180) return Response.json({ error: "companyExternalId 无效" }, { status: 400 });
  if (contactId && !/^[0-9a-f-]{36}$/i.test(contactId)) return Response.json({ error: "contactId 无效" }, { status: 400 });
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/i.test(language)) return Response.json({ error: "language 无效" }, { status: 400 });
  if (tone && tone.length > 100) return Response.json({ error: "tone 过长" }, { status: 400 });
  if (instructions && instructions.length > 2_000) return Response.json({ error: "instructions 过长" }, { status: 400 });
  if (targetLength !== undefined && (targetLength < 180 || targetLength > 500)) {
    return Response.json({ error: "targetLength 必须在 180–500 之间" }, { status: 400 });
  }
  try {
    const result = await runDevelopmentStrategyAgent(session.userId, {
      companyExternalId, contactId, language, tone, instructions, targetLength,
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "开发策略生成失败" }, { status: 500 });
  }
}
