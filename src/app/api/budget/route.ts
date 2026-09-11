import { z } from "zod";
import {requireApiSession} from "@/lib/auth/session";
import {readSpendBudget,setSpendBudget} from "@/lib/billing/repository";
import {billingPolicy,dollarsToMicros} from "@/lib/billing/policy";
export const runtime="nodejs";
export async function GET(){
  const session=await requireApiSession();if(session instanceof Response)return session;
  try{return Response.json({...await readSpendBudget(session.userId),tariffVersion:billingPolicy.version,configuredRules:billingPolicy.rules.length,
    notice:"当前接入后台线索工作流、助手聊天、开发策略/修订及跟进生成；联系人、独立知识处理及邮箱学习入口尚未全量接入。累计预算不自动按月重置。预留占用不等于实际账单；未知费用保留占用，缺价或费用上界不明时阻止已接入的付费请求。"},{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"预算读取失败；不能推断可用金额"},{status:503});}
}
export async function PUT(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=z.object({limitUsd:z.string(),confirmed:z.literal(true)}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"请确认新的累计美元预算"},{status:400});
  try{await setSpendBudget(session.userId,dollarsToMicros(parsed.data.limitUsd));return Response.json({saved:true});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"预算保存失败"},{status:400});}
}
