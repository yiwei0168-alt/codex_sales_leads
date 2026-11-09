import {z} from 'zod';

/** Metadata only. This is neither a completed answer nor authorization to retry. */
export const incompleteStreamReceiptSchema=z.object({
 version:z.literal('incomplete-model-stream-v1'),
 generationId:z.string().regex(/^gen-[-a-zA-Z0-9_]+$/).max(128),
 reportedModel:z.string().regex(/^[-a-zA-Z0-9_./:@]+$/).max(200),
 finishReason:z.enum(['stop','tool_calls','length','content_filter','error']).nullable(),
 doneMarker:z.boolean(),
}).strict();
export type IncompleteStreamReceipt=z.infer<typeof incompleteStreamReceiptSchema>;
const receipts=new WeakMap<object,IncompleteStreamReceipt>();
export function retainIncompleteStreamReceipt(error:unknown,value:unknown){
 const parsed=incompleteStreamReceiptSchema.safeParse(value);
 if(error&&typeof error==='object'&&parsed.success)receipts.set(error,Object.freeze(parsed.data));
}
export function incompleteStreamReceipt(error:unknown):IncompleteStreamReceipt|undefined{
 return error&&typeof error==='object'?receipts.get(error):undefined;
}
