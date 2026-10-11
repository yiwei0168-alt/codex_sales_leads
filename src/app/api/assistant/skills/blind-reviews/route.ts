import {requireApiSession} from '@/lib/auth/session';
import {startBlindReview,startBlindReviewSchema,readBlindReview,appendBlindJudgment,blindJudgmentSchema,revealBlindReviewSchema,revealBlindReview} from '@/lib/assistant/main/skill-blind-review';
import {z} from 'zod';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const id=z.uuid().safeParse(new URL(request.url).searchParams.get('id'));if(!id.success)return Response.json({error:'审核编号无效'},{status:400});
 try{return Response.json(await readBlindReview(session.userId,id.data),{headers});}catch{return Response.json({error:'审核不可用或来源已变化，请返回列表核对'},{status:409,headers});}
}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const text=await request.text();if(text.length>24000)return Response.json({error:'审核内容过长'},{status:413});
 let body:unknown;try{body=JSON.parse(text);}catch{return Response.json({error:'参数无效'},{status:400});}
 const start=startBlindReviewSchema.safeParse(body),judgment=blindJudgmentSchema.safeParse(body),reveal=revealBlindReviewSchema.safeParse(body);
 if(!start.success&&!judgment.success&&!reveal.success)return Response.json({error:'审核参数无效'},{status:400});
 try{return Response.json(start.success?await startBlindReview(session.userId,start.data):reveal.success?await revealBlindReview(session.userId,reveal.data):await appendBlindJudgment(session.userId,judgment.data!,'account-user'),{headers});}
 catch{return Response.json({error:'评测来源、版本或审核修订已变化，请重新读取；未保存草稿仍保留'},{status:409,headers});}
}
