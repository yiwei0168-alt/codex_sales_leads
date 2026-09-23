import { requireApiSession } from "@/lib/auth/session";
import { reviewMailboxCandidate } from "@/lib/mailbox/candidate-review";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const body=await request.json().catch(()=>null);
  if(!body||!Array.isArray(body.items)||body.items.length<1||body.items.length>8||!['approved','rejected'].includes(body.status))
    return Response.json({error:"一次只能审核当前页的 1 至 8 条候选"},{status:400});
  const ids=new Set<string>();
  for(const item of body.items){
    if(typeof item?.id!=="string"||!/^[0-9a-f-]{36}$/i.test(item.id)||typeof item?.contentHash!=="string"||!/^[a-f0-9]{64}$/.test(item.contentHash)||ids.has(item.id))
      return Response.json({error:"候选 ID 或内容版本无效"},{status:400});
    ids.add(item.id);
  }
  if(body.status==="approved"&&body.confirmed!==true)return Response.json({error:"批准写入私有知识库需要明确确认"},{status:400});
  const results=[];
  for(const item of body.items){
    try{const result=await reviewMailboxCandidate(session.userId,item.id,body.status,item.contentHash);
      results.push({id:item.id,result:result.kind});
    }catch(error){results.push({id:item.id,result:"failed",error:error instanceof Error?error.message:"审核失败"});}
  }
  return Response.json({results,processed:results.filter(item=>item.result==="saved").length,failed:results.filter(item=>item.result!=="saved").length});
}
