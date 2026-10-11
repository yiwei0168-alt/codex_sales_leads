import {z} from 'zod';
import {requireApiSession} from '@/lib/auth/session';
import {ExtractionReviewConflict,completeExtractionReview,retryExtractionVisuals,extractionReviewDecision,getExtractionReview,getExtractionReviewOriginal,getExtractionReviewImage,recordExtractionReview} from '@/lib/knowledge/extraction-review';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown){return error instanceof ExtractionReviewConflict
  ?Response.json({error:error.message},{status:409,headers})
  :Response.json({error:'抽取审核暂不可用，未恢复索引'},{status:503,headers});}
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  if(params.get('format')==='image'){
    const input=z.object({jobId:z.uuid(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),blockId:z.string().min(1).max(300)}).safeParse({jobId:params.get('jobId'),artifactSha256:params.get('artifactSha256'),blockId:params.get('blockId')});
    if(!input.success)return Response.json({error:'预览参数无效'},{status:400,headers});
    try{const bytes=await getExtractionReviewImage(session.userId,input.data.jobId,input.data.artifactSha256,input.data.blockId);
      return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'image/png','X-Content-Type-Options':'nosniff'}});
    }catch(error){return failure(error);}
  }
  if(params.get('format')==='original'){
    const original=z.object({jobId:z.uuid(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse({jobId:params.get('jobId'),artifactSha256:params.get('artifactSha256')});
    if(!original.success)return Response.json({error:'原件版本参数无效'},{status:400,headers});
    try{const file=await getExtractionReviewOriginal(session.userId,original.data.jobId,original.data.artifactSha256);
      return new Response(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff',
        'Content-Disposition':`attachment; filename="original"; filename*=UTF-8''${encodeURIComponent(file.filename)}`}});
    }catch(error){return failure(error);}
  }
  const input=z.object({jobId:z.uuid(),offset:z.coerce.number().int().min(0).max(1000000)}).safeParse({jobId:params.get('jobId'),offset:params.get('offset')??0});
  if(!input.success)return Response.json({error:'审核参数无效'},{status:400,headers});
  try{return Response.json(await getExtractionReview(session.userId,input.data.jobId,input.data.offset),{headers});}catch(error){return failure(error);}
}
export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const reader=request.body?.getReader();if(!reader)return Response.json({error:'缺少审核决定'},{status:400,headers});
  let size=0;const chunks:Uint8Array[]=[];
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>128000){await reader.cancel();return Response.json({error:'审核内容过长'},{status:413,headers});}chunks.push(value);}
  }catch{return Response.json({error:'审核内容读取失败'},{status:400,headers});}finally{reader.releaseLock();}
  let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return Response.json({error:'审核格式无效'},{status:400,headers});}
  const retry=z.object({action:z.literal('retry-visuals'),jobId:z.uuid(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(raw);
  if(retry.success){try{return Response.json(await retryExtractionVisuals(session.userId,retry.data.jobId,retry.data.artifactSha256),{headers});}catch(error){return failure(error);}}
  const completion=z.object({action:z.literal('complete'),jobId:z.uuid(),artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),decisionSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(raw);
  if(completion.success){try{return Response.json(await completeExtractionReview(session.userId,completion.data.jobId,completion.data.artifactSha256,completion.data.decisionSha256),{headers});}catch(error){return failure(error);}}
  const input=extractionReviewDecision.safeParse(raw);if(!input.success)return Response.json({error:'请填写有效的审核决定和依据'},{status:400,headers});
  try{return Response.json(await recordExtractionReview(session.userId,input.data),{headers});}catch(error){return failure(error);}
}
