import {z} from "zod";
import {requireApiSession} from "@/lib/auth/session";
import {decideFactReview,listFactReviews} from "@/lib/knowledge/review-repository";

export const runtime="nodejs";export const dynamic="force-dynamic";
function adminOnly(role:string){return role==="admin"?null:Response.json({error:"仅管理员可复核共享知识"},{status:403});}

export async function GET(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;const forbidden=adminOnly(session.role);if(forbidden)return forbidden;
  const params=new URL(request.url).searchParams;const parsed=z.object({offset:z.coerce.number().int().min(0).max(100000),limit:z.coerce.number().int().min(1).max(50),reason:z.string().max(40),query:z.string().max(160),status:z.enum(["open","accepted","corrected","rejected","replace-source"])}).safeParse({offset:params.get("offset")??0,limit:params.get("limit")??25,reason:params.get("reason")??"",query:params.get("q")??"",status:params.get("status")??"open"});
  if(!parsed.success)return Response.json({error:"复核筛选参数无效"},{status:400});try{return Response.json(await listFactReviews(session.userId,parsed.data),{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"事实复核队列读取失败"},{status:503});}}

const patchSchema=z.object({reviewId:z.uuid(),decision:z.enum(["verify","retain-candidate","reject","correct"]),note:z.string().trim().max(1000).default(""),correctedValue:z.unknown().optional(),correctedRawValue:z.string().trim().max(2000).optional(),correctedUnit:z.string().trim().max(40).nullable().optional()}).strict().superRefine((value,ctx)=>{if(value.decision==="correct"&&(value.correctedValue===undefined||!value.correctedRawValue))ctx.addIssue({code:"custom",message:"纠正时必须提供结构化值和原始值"});});
export async function PATCH(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;const forbidden=adminOnly(session.role);if(forbidden)return forbidden;const parsed=patchSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"复核决定无效"},{status:400});
  try{await decideFactReview(session.userId,parsed.data);return Response.json({ok:true});}catch(error){const message=error instanceof Error?error.message:"";if(message==="review-not-found")return Response.json({error:"复核项不存在"},{status:404});if(message==="review-already-resolved")return Response.json({error:"该复核项已被处理，请刷新"},{status:409});if(message==="invalid-correction")return Response.json({error:"纠正值或单位不符合属性注册表"},{status:400});return Response.json({error:"复核决定未保存"},{status:503});}}
