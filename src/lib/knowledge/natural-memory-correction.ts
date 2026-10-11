import {createHash} from 'node:crypto';
import {z} from 'zod';

export const naturalCorrectionSchema=z.object({
  intent:z.enum(['correction','not-correction','uncertain']),
  oldContent:z.string().trim().min(3).max(800).nullable(),
  content:z.string().trim().min(3).max(800).nullable(),
}).strict();
export type NaturalCorrectionProposal={messageSha256:string;output:z.infer<typeof naturalCorrectionSchema>};
export const correctionMessageHash=(text:string)=>createHash('sha256').update(text).digest('hex');

/** Ingestion hint only; it neither routes Agent tasks nor selects a memory target. */
export function mayContainMemoryCorrection(text:string){
  return /更正|纠正|记错|说错|之前.{0,60}(?:不对|实际)|不是[\s\S]{1,800}而是|\b(?:correct(?:ion)?|misremember|previously|actually|was wrong)\b/i.test(text);
}
export function validateNaturalCorrection(text:string,proposal:NaturalCorrectionProposal){
  if(proposal.messageSha256!==correctionMessageHash(text))throw new Error('Correction source changed');
  const p=naturalCorrectionSchema.parse(proposal.output);
  if(p.intent==='not-correction')return {recognized:false} as const;
  // Model output proposes exact spans only. Identity, scope and uniqueness come from PostgreSQL.
  if(p.oldContent&&!text.includes(p.oldContent)||p.content&&!text.includes(p.content))throw new Error('schema_invalid');
  if(p.intent!=='correction'||!p.oldContent||!p.content||p.oldContent===p.content)return {recognized:true} as const;
  const framing=/^(?:(?:你|我|我们)?(?:记错了?|说错了?|之前说)|(?:这|那|这个|那个)(?:不对|错了)|(?:that|this|it) (?:is|was) (?:wrong|incorrect)|(?:i|we) previously said|you (?:misremembered|were wrong))\s*[。.!！]?$/i;
  if(framing.test(p.oldContent)||framing.test(p.content)||/^(?:我之前说|纠正一下|I previously said)\s*/i.test(p.oldContent))return {recognized:true} as const;
  const sensitive=/(?:policy|score|approv|permission|system prompt|ignore|override|bypass|effective|from now|starting|since|until)|政策|评分|批准|权限|系统提示|忽略|绕过|生效|从今|从现在|以后|自从|截至|截止|改为从/i;
  const attributed=/^\s*(?:>|```|["“「]|客户|邮件|原文|文档|转述|引用|customer|the customer|quoted?|document|email)/i;
  if(sensitive.test(text)||attributed.test(text)||/[?？]|\b(?:if|hypothetical|example|do not correct|don't correct)\b|假如|如果|例如|举例|不要更正|不要修改/i.test(text))return {recognized:true} as const;
  return {recognized:true,correction:{oldContent:p.oldContent,content:p.content}} as const;
}
