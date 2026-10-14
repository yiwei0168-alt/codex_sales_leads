import {z} from 'zod';
import {requireApiSession} from '@/lib/auth/session';
import {listSkillAcceptanceReviews,readSkillAcceptanceReview,readSkillAcceptanceReviewCase} from '@/lib/assistant/main/skill-acceptance-review';
import {appendSkillAcceptanceJudgment,appendSkillAcceptanceJudgmentSchema} from '@/lib/assistant/main/skill-acceptance-store';
const headers={'Cache-Control':'private, no-store'};
const query=z.union([
 z.object({skillId:z.uuid(),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict(),
 z.object({id:z.uuid(),caseId:z.string().min(1).max(200).optional()}).strict(),
]);
export async function GET(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!parsed.success)return Response.json({error:'审核查询参数无效'},{status:400,headers});
 try{const p=parsed.data,context={userId:session.userId};
  return Response.json('skillId' in p?await listSkillAcceptanceReviews(context,p):p.caseId
   ?await readSkillAcceptanceReviewCase(context,{bundleId:p.id,caseId:p.caseId}):await readSkillAcceptanceReview(context,p.id),{headers});
 }catch{return Response.json({error:'审核材料不可用或来源已变化，请刷新后核对'},{status:409,headers});}
}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const origin=request.headers.get('origin');
 const target=new URL(request.url),host=request.headers.get('host');
 const sameOrigin=!origin||origin===target.origin||(host&&origin===`${target.protocol}//${host}`);
 if(!sameOrigin||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??''))return Response.json({error:'请求来源无效'},{status:403,headers});
 const text=await request.text();if(text.length>24000)return Response.json({error:'审核内容过长'},{status:413,headers});
 let body:unknown;try{body=JSON.parse(text);}catch{return Response.json({error:'审核参数无效'},{status:400,headers});}
 const parsed=appendSkillAcceptanceJudgmentSchema.safeParse(body);
 if(!parsed.success)return Response.json({error:'审核参数无效'},{status:400,headers});
 try{
  const p=parsed.data,context={userId:session.userId};
  if(!p.judgment.revoked){
   const material=await readSkillAcceptanceReviewCase(context,{bundleId:p.bundleId,caseId:p.judgment.caseId});
   if(material.artifactHash!==p.artifactHash||material.observationHash!==p.judgment.observationHash)throw new Error('Review material changed');
   for(const side of ['baseline','candidate'] as const)if(!material.canPass[side]&&Object.values(p.judgment[side]).some(Boolean))
    throw new Error('Incomplete safety arm cannot pass review');
  }
  return Response.json(await appendSkillAcceptanceJudgment({...context,reviewerKind:'human'},p),{headers});
 }catch{return Response.json({error:'来源、冻结状态或审核修订已变化；未保存，请刷新后核对'},{status:409,headers});}
}
