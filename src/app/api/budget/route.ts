import { z } from "zod";
import {requireApiSession} from "@/lib/auth/session";
import {readSpendBudget,setSpendBudget,readTaskSpendBudget,setTaskSpendBudget} from "@/lib/billing/repository";
import {billingPolicy,dollarsToMicros} from "@/lib/billing/policy";
import {tariffValidity} from "@/lib/billing/tariff-validity";
import {readBillingReferenceStatus} from "@/lib/billing/fx-reference-repository";
import {readOpenRouterSolRateStatus} from "@/lib/billing/openrouter-rate-repository";
import {readDeepSeekRateStatuses} from "@/lib/billing/deepseek-rate-repository";
import {DEEPSEEK_RATE_SOURCES} from "@/lib/billing/deepseek-rate-reference";
import {readSearchRateStatuses} from "@/lib/billing/search-rate-repository";
import {SEARCH_RATE_SOURCES} from "@/lib/billing/search-rate-reference";
export const runtime="nodejs";
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const actionId=new URL(request.url).searchParams.get("actionId");
  if(actionId&&!z.uuid().safeParse(actionId).success)return Response.json({error:"任务ID无效"},{status:400});
  if(actionId){try{return Response.json(await readTaskSpendBudget(session.userId,actionId),{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"任务预算不可读取"},{status:404});}}
  const observedAt=Date.now();
  try{return Response.json({...await readSpendBudget(session.userId),tariffVersion:billingPolicy.version,configuredRules:billingPolicy.rules.length,
    referenceVerification:await readBillingReferenceStatus(observedAt),
    openRouterRateReference:await readOpenRouterSolRateStatus().catch(()=>({checkedAt:null,nextAttemptAt:null,status:"unavailable",hold:null})),
    deepSeekRateReferences:await readDeepSeekRateStatuses().catch(()=>DEEPSEEK_RATE_SOURCES.map(source=>({
      sourceKey:source.sourceKey,tariffKey:source.tariffKey,checkedAt:null,nextAttemptAt:null,status:"unavailable",hold:null}))),
    searchRateReferences:await readSearchRateStatuses().catch(()=>SEARCH_RATE_SOURCES.map(source=>({
      sourceKey:source.sourceKey,tariffKey:source.tariffKey,checkedAt:null,nextAttemptAt:null,status:"unavailable",hold:null}))),
    tariffVerification:{checkedAt:new Date(observedAt).toISOString(),scope:'static-request-bounds-only',rules:billingPolicy.rules.map(rule=>({key:rule.key,reference:rule.reference,verifiedAt:rule.verifiedAt,...tariffValidity(rule,observedAt)}))},
    notice:"已接入当前产品的线索工作流、聊天、开发生成、联系人、关系分析、知识和邮箱学习付费入口；费率上界仍需逐项审核配置，不能据此认定已具备真实付费验收条件。累计预算不自动按月重置。预留占用不等于实际账单；未知费用保留占用，缺价或费用上界不明时阻止已接入的付费请求。"},{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"预算读取失败；不能推断可用金额"},{status:503});}
}
export async function PUT(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({limitUsd:z.string(),confirmed:z.literal(true),actionId:z.uuid().optional()}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"请确认新的累计美元预算"},{status:400});
  try{const limit=dollarsToMicros(parsed.data.limitUsd);if(parsed.data.actionId)await setTaskSpendBudget(session.userId,parsed.data.actionId,limit);else await setSpendBudget(session.userId,limit);return Response.json({saved:true});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"预算保存失败"},{status:400});}
}
