import {assertLabeledReviewAvailable} from '@/lib/assistant/main/skill-blind-review';
import {requireApiSession} from '@/lib/auth/session';
import {appendSkillShadowReview,appendShadowReviewSchema,readSkillShadowReview,listSkillShadowReviews} from '@/lib/assistant/main/skill-shadow-review';
import {z} from 'zod';

export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  if(!params.has('id')){
    const p=z.object({skillId:z.uuid(),offset:z.coerce.number().int().min(0).max(100000)}).safeParse({skillId:params.get('skillId'),offset:params.get('offset')??0});
    if(!p.success)return Response.json({error:'查询参数无效'},{status:400});
    return Response.json(await listSkillShadowReviews(session,p.data.skillId,p.data.offset),{headers:{'Cache-Control':'private, no-store'}});
  }
  const id=z.uuid().safeParse(params.get('id'));
  if(!id.success)return Response.json({error:'评测编号无效'},{status:400});
  try{await assertLabeledReviewAvailable(session.userId,'shadow',id.data);return Response.json(await readSkillShadowReview(session,id.data),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'评测不可用、来源已变化或已进入匿名审核，请使用匿名 A/B 入口'},{status:409});}
}

export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const text=await request.text();if(text.length>24000)return Response.json({error:'审核内容过长'},{status:413});
  let body:unknown;try{body=JSON.parse(text);}catch{return Response.json({error:'审核参数无效'},{status:400});}
  const p=appendShadowReviewSchema.safeParse(body);
  if(!p.success)return Response.json({error:'审核参数无效'},{status:400});
  try{await assertLabeledReviewAvailable(session.userId,'shadow',p.data.id);return Response.json(await appendSkillShadowReview(session,p.data),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'评测来源、Skill 版本或审核修订已变化，请重新读取'},{status:409});}
}
