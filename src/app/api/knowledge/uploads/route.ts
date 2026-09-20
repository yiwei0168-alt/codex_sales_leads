import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { createKnowledgeUploadJob, listKnowledgeUploadJobs, MAX_KNOWLEDGE_BINARY_BYTES } from "@/lib/knowledge/upload";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function authorized(request:Request):boolean{
  const expected=process.env.KNOWLEDGE_ADMIN_TOKEN;
  if(!expected)return process.env.NODE_ENV==="development";
  return request.headers.get("authorization")===`Bearer ${expected}`;
}

export async function GET(){
  const session=await requireApiSession();if(session instanceof Response)return session;
  try{return Response.json({jobs:await listKnowledgeUploadJobs(session.userId)},{headers:{"Cache-Control":"private, no-store"}});}
  catch{return Response.json({error:"提取作业暂不可读取"},{status:503});}
}

export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const declaredBytes=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(declaredBytes)&&declaredBytes>MAX_KNOWLEDGE_BINARY_BYTES+128_000)return Response.json({error:"二进制资料上限为25 MB"},{status:413});
  let form:FormData;try{form=await request.formData();}catch{return Response.json({error:"请求必须是 multipart/form-data"},{status:400});}
  const parsed=z.object({collection:z.enum(["industry","company","product"]),title:z.string().trim().min(1).max(300),
    sourceUrl:z.union([z.url(),z.literal("")]).default(""),visibility:z.enum(["private","shared"]).default("private"),
    entityKey:z.string().trim().max(200).default("")}).safeParse({collection:form.get("collection"),title:form.get("title"),
      sourceUrl:form.get("sourceUrl")??"",visibility:form.get("visibility")??"private",entityKey:form.get("entityKey")??""});
  if(!parsed.success)return Response.json({error:"上传字段无效"},{status:400});
  if(parsed.data.visibility==="shared"&&(session.role!=="admin"||!authorized(request)))return Response.json({error:"只有具备共享上传授权的管理员可以上传共享资料"},{status:403});
  if(parsed.data.collection==="product"&&!parsed.data.entityKey)return Response.json({error:"产品资料必须提供型号 / SKU"},{status:400});
  const file=form.get("file");if(!(file instanceof File))return Response.json({error:"缺少二进制资料文件"},{status:400});
  try{
    const result=await createKnowledgeUploadJob(session.userId,{collection:parsed.data.collection,title:parsed.data.title,
      originalFilename:file.name,mimeType:file.type,bytes:new Uint8Array(await file.arrayBuffer()),sourceUrl:parsed.data.sourceUrl||undefined,
      visibility:parsed.data.visibility,entityKey:parsed.data.entityKey||undefined});
    return Response.json(result,{status:202,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"二进制资料上传失败"},{status:400});}
}
