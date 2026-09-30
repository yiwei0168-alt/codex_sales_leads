import {z} from "zod";
import {requireApiSession} from "@/lib/auth/session";
import {listHoldoutAnswerReviews,saveHoldoutAnswerVerdict} from "@/lib/knowledge/evaluation/holdout-review-local";

export const runtime="nodejs";export const dynamic="force-dynamic";
function adminOnly(role:string){return role==="admin"?null:Response.json({error:"仅管理员可审核锁定集回答"},{status:403});}
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const forbidden=adminOnly(session.role);if(forbidden)return forbidden;
  const search=new URL(request.url).searchParams;
  const parsed=z.object({offset:z.coerce.number().int().min(0).max(100),limit:z.coerce.number().int().min(1).max(10),
    pendingOnly:z.enum(["true","false"])}).safeParse({offset:search.get("offset")??0,
    limit:search.get("limit")??5,pendingOnly:search.get("pendingOnly")??"true"});
  if(!parsed.success)return Response.json({error:"审核筛选参数无效"},{status:400});
  try{return Response.json(await listHoldoutAnswerReviews(session.userId,{offset:parsed.data.offset,
    limit:parsed.data.limit,pendingOnly:parsed.data.pendingOnly==="true"}),
    {headers:{"Cache-Control":"private, no-store"}});}
  catch{return Response.json({error:"本机锁定集候选尚未准备好，或冻结输入已变化"},{status:503});}
}
const verdictSchema=z.object({caseId:z.string().min(1).max(120),path:z.enum(["v3","vectorless"]),
  candidateSha256:z.string().regex(/^[0-9a-f]{64}$/),answerCorrect:z.boolean(),
  preciseCitationCorrect:z.boolean(),note:z.string().trim().max(2000).default("")}).strict();
export async function PATCH(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const forbidden=adminOnly(session.role);if(forbidden)return forbidden;
  const parsed=verdictSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"请分别评价答案和精确来源"},{status:400});
  try{return Response.json(await saveHoldoutAnswerVerdict(session.userId,parsed.data));}
  catch(error){const message=error instanceof Error?error.message:"";
    if(message.includes("Candidate changed"))return Response.json({error:"候选答案已变化，请刷新后重审"},{status:409});
    if(message.includes("Unexpected citation")||message.includes("Precise citation verdict"))
      return Response.json({error:"该候选的引用不满足精确来源条件，请将来源评价改为不正确"},{status:400});
    return Response.json({error:"判决未保存，请核对冻结资料和本机状态"},{status:503});
  }
}
