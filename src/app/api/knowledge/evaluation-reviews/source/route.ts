import {z} from "zod";
import {requireApiSession} from "@/lib/auth/session";
import {listGoldSourceEvidence} from "@/lib/knowledge/gold-source";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const session=await requireApiSession();
  if(session instanceof Response)return session;
  if(session.role!=="admin")return Response.json({error:"仅管理员可审核共享 Gold"},{status:403});
  const params=new URL(request.url).searchParams;
  const parsed=z.object({assetSha256:z.string().regex(/^[0-9a-f]{64}$/),unitIndex:z.coerce.number().int().min(1)}).safeParse({assetSha256:params.get("assetSha256"),unitIndex:params.get("unitIndex")});
  if(!parsed.success)return Response.json({error:"来源坐标无效"},{status:400});
  try{
    const blocks=await listGoldSourceEvidence(session.userId,parsed.data.assetSha256,parsed.data.unitIndex);
    return Response.json({blocks:blocks.slice(0,200).map(block=>({...block,content:block.content.slice(0,500)})),truncated:blocks.length>200},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"原文读取失败"},{status:503});}
}
