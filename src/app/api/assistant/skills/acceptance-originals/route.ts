import {z} from 'zod';
import {requireApiSession} from '@/lib/auth/session';
import {previewSkillAcceptanceOriginals,captureSkillAcceptanceOriginals,captureSkillAcceptanceOriginalsSchema} from '@/lib/assistant/main/skill-acceptance-originals';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const p=z.object({bundleId:z.uuid()}).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!p.success)return Response.json({error:'原件查询参数无效'},{status:400,headers});
 try{return Response.json(await previewSkillAcceptanceOriginals({userId:session.userId},p.data.bundleId),{headers});}
 catch{return Response.json({error:'原件来源、权限或冻结状态已变化，请刷新后核对'},{status:409,headers});}
}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const origin=request.headers.get('origin'),target=new URL(request.url),host=request.headers.get('host');
 if(origin&&origin!==target.origin&&(!host||origin!==`${target.protocol}//${host}`)||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??''))
  return Response.json({error:'请求来源无效'},{status:403,headers});
 const text=await request.text();if(text.length>4096)return Response.json({error:'原件保存请求过长'},{status:413,headers});
 let body:unknown;try{body=JSON.parse(text);}catch{return Response.json({error:'原件保存参数无效'},{status:400,headers});}
 const p=captureSkillAcceptanceOriginalsSchema.safeParse(body);
 if(!p.success)return Response.json({error:'原件保存参数无效'},{status:400,headers});
 try{return Response.json(await captureSkillAcceptanceOriginals({userId:session.userId},p.data),{headers});}
 catch{return Response.json({error:'保存结果未确认；请刷新后核对原件、权限、文件内容及预览'},{status:409,headers});}
}
