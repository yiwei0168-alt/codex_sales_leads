import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { createKnowledgeUploadJob, listKnowledgeUploadJobs, MAX_KNOWLEDGE_BINARY_BYTES, KnowledgeUploadConflictError } from "@/lib/knowledge/upload";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function authorized(request:Request):boolean{
  const expected=process.env.KNOWLEDGE_ADMIN_TOKEN;
  if(!expected)return process.env.NODE_ENV==="development";
  return request.headers.get("authorization")===`Bearer ${expected}`;
}

export async function GET(request?:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=request?new URL(request.url).searchParams:new URLSearchParams();
  const paging=z.object({offset:z.coerce.number().int().min(0).max(1_000_000),limit:z.coerce.number().int().min(1).max(50)})
    .safeParse({offset:params.get('offset')??0,limit:params.get('limit')??30});
  if(!paging.success)return Response.json({error:'分页参数无效'},{status:400});
  try{return Response.json({jobs:await listKnowledgeUploadJobs(session.userId,paging.data.offset,paging.data.limit)},{headers:{"Cache-Control":"private, no-store"}});}
  catch{return Response.json({error:"提取作业暂不可读取"},{status:503});}
}

export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const declaredBytes=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(declaredBytes)&&declaredBytes>MAX_KNOWLEDGE_BINARY_BYTES+128_000)return Response.json({error:"二进制资料上限为25 MB"},{status:413});
  let form:FormData;try{form=await request.formData();}catch{return Response.json({error:"请求必须是 multipart/form-data"},{status:400});}
  const parsed=z.object({collection:z.enum(["industry","company","product"]),title:z.string().trim().min(1).max(300),
    sourceUrl:z.union([z.url(),z.literal("")]).default(""),visibility:z.enum(["private","shared"]).default("private"),
    entityKey:z.string().trim().max(200).default(""),revisionDocumentId:z.uuid().optional(),revisionBaseVersionId:z.uuid().optional()})
    .refine(value=>Boolean(value.revisionDocumentId)===Boolean(value.revisionBaseVersionId))
    .safeParse({collection:form.get("collection"),title:form.get("title"),sourceUrl:form.get("sourceUrl")??"",visibility:form.get("visibility")??"private",entityKey:form.get("entityKey")??"",
      revisionDocumentId:form.get('revisionDocumentId')??undefined,revisionBaseVersionId:form.get('revisionBaseVersionId')??undefined});
  if(!parsed.success)return Response.json({error:"上传字段无效"},{status:400});
  if(parsed.data.visibility==="shared"&&(session.role!=="admin"||!authorized(request)))return Response.json({error:"只有具备共享上传授权的管理员可以上传共享资料"},{status:403});
  if(parsed.data.collection==="product"&&!parsed.data.entityKey)return Response.json({error:"产品资料必须提供型号 / SKU"},{status:400});
  const file=form.get("file");if(!(file instanceof File))return Response.json({error:"缺少二进制资料文件"},{status:400});
  try{
    const result=await createKnowledgeUploadJob(session.userId,{collection:parsed.data.collection,title:parsed.data.title,
      originalFilename:file.name,mimeType:file.type,bytes:new Uint8Array(await file.arrayBuffer()),sourceUrl:parsed.data.sourceUrl||undefined,
      visibility:parsed.data.visibility,entityKey:parsed.data.entityKey||undefined,revisionDocumentId:parsed.data.revisionDocumentId,revisionBaseVersionId:parsed.data.revisionBaseVersionId});
    return Response.json(result,{status:result.reused?200:202,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){if(error instanceof KnowledgeUploadConflictError)return Response.json({error:'资料已有更新，请重新选择当前版本后提交；本次未覆盖资料。'},{status:409});
    return Response.json({error:error instanceof Error?error.message:"二进制资料上传失败"},{status:400});}
}
