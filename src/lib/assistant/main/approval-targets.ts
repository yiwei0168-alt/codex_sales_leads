import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';

export type ApprovalTarget = {kind:'private-knowledge';state:'current'|'changed';title:string}
 | {kind:'private-knowledge';state:'unavailable'};
const privateDocument=z.object({documentId:z.uuid(),expectedHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();

/** Read-only display metadata. Never changes the stored payload/approval hash,
 * and never resolves a private title outside the current actor's ownership. */
export async function withApprovalTargets<T extends {tool_id:string;payload:unknown}>(userId:string,approvals:readonly T[]):Promise<Array<T&{target?:ApprovalTarget}>>{
 const selections=approvals.map(approval=>approval.tool_id==='knowledge_private_delete'?privateDocument.safeParse(approval.payload):undefined);
 const ids=[...new Set(selections.flatMap(selection=>selection?.success?[selection.data.documentId.toLowerCase()]:[]))];
 const documents=ids.length?await tenantQuery<{id:string;title:string;content_sha256:string}>(userId,
  "select id,title,content_sha256 from knowledge_document where owner_id=$1 and visibility='private' and id=any($2::uuid[])", [userId,ids]):[];
 const byId=new Map(documents.map(document=>[document.id,document]));
 return approvals.map((approval,index)=>{
  if(approval.tool_id!=='knowledge_private_delete')return approval;
  const selection=selections[index],document=selection?.success?byId.get(selection.data.documentId.toLowerCase()):undefined;
  const target:ApprovalTarget=document&&selection?.success?
   {kind:'private-knowledge',state:document.content_sha256===selection.data.expectedHash?'current':'changed',title:document.title||'未命名资料'}:
   {kind:'private-knowledge',state:'unavailable'};
  return {...approval,target};
 });
}
