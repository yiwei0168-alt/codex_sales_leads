import {z} from "zod";
import {requireApiSession} from "@/lib/auth/session";
import {browseTree,readEvidence} from "@/lib/knowledge/vectorless";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const querySchema=z.object({documentId:z.uuid(),parentId:z.uuid().nullable(),nodeId:z.uuid().nullable(),offset:z.number().int().min(0).max(100000)});
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  const parsed=querySchema.safeParse({documentId:params.get("documentId"),parentId:params.get("parentId"),nodeId:params.get("nodeId"),offset:Number(params.get("offset")??0)});
  if(!parsed.success)return Response.json({error:"Invalid tree request"},{status:400});
  const {documentId,parentId,nodeId,offset}=parsed.data;
  if(nodeId){
    const evidence=await readEvidence(session.userId,nodeId);
    return evidence?.documentId===documentId?Response.json({evidence},{headers:{"Cache-Control":"private, no-store"}})
      :Response.json({error:"Evidence unavailable"},{status:404});
  }
  const nodes=await browseTree(session.userId,documentId,parentId,offset,21);
  return Response.json({nodes:nodes.slice(0,20),hasMore:nodes.length>20},{headers:{"Cache-Control":"private, no-store"}});
}
