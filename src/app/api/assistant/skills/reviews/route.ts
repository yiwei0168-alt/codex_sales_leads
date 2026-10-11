import {requireApiSession} from '@/lib/auth/session';
import {appendSkillReplayReview,appendSkillReviewSchema,readSkillReplayReview,listSkillReplayReviews} from '@/lib/assistant/main/skill-review-store';
import {z} from 'zod';

export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  if(!params.has('id')){
    const p=z.object({skillId:z.uuid(),offset:z.coerce.number().int().min(0).max(100000)}).safeParse({skillId:params.get('skillId'),offset:params.get('offset')??0});
    if(!p.success)return Response.json({error:'查询参数无效'},{status:400});
    return Response.json(await listSkillReplayReviews(session,p.data.skillId,p.data.offset),{headers:{'Cache-Control':'private, no-store'}});
  }
  const id=z.uuid().safeParse(params.get('id'));
  if(!id.success)return Response.json({error:'评测编号无效'},{status:400});
  try{return Response.json(await readSkillReplayReview(session,id.data),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'评测不可用或来源已变化'},{status:409});}
}

export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const text=await request.text();if(text.length>24000)return Response.json({error:'审核内容过长'},{status:413});
  let body:unknown;try{body=JSON.parse(text);}catch{return Response.json({error:'审核参数无效'},{status:400});}
  const p=appendSkillReviewSchema.safeParse(body);
  if(!p.success)return Response.json({error:'审核参数无效'},{status:400});
  try{return Response.json(await appendSkillReplayReview(session,p.data),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'评测来源、Skill 版本或审核修订已变化，请重新读取'},{status:409});}
}
