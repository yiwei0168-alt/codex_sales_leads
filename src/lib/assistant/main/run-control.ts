import {z} from 'zod';

export const instructionRequestKeySchema=z.uuid().transform(value=>value.toLowerCase());
export const runControlSchema=z.object({
  action:z.enum(['pause','resume','cancel','instruct']),
  content:z.string().trim().min(1).max(100_000).optional(),
  requestKey:instructionRequestKeySchema.optional(),
}).strict().refine(input=>input.action!=='instruct'||Boolean(input.content),{message:'Instruction required'})
  .refine(input=>input.requestKey===undefined||input.action==='instruct',{message:'Submission identity is only for instructions'});
export type InstructionSubmissionReceipt={recorded:false;terminal:boolean}|{recorded:true;content:string};
