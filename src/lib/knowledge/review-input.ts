import {z} from "zod";

export const factReviewListSchema=z.object({
  offset:z.number().int().min(0).max(100000).default(0),
  limit:z.number().int().min(1).max(50).default(25),
  reason:z.string().max(40).default(""),
  query:z.string().max(160).default(""),
  status:z.enum(["open","accepted","corrected","rejected","replace-source"]).default("open"),
}).strict();

export const factReviewDecisionSchema=z.object({
  reviewId:z.uuid(),
  decision:z.enum(["verify","retain-candidate","reject","correct"]),
  note:z.string().trim().max(1000).default(""),
  correctedValue:z.unknown().optional(),
  correctedRawValue:z.string().trim().max(2000).optional(),
  correctedUnit:z.string().trim().max(40).nullable().optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.decision==="correct"&&(value.correctedValue===undefined||!value.correctedRawValue))
    ctx.addIssue({code:"custom",message:"纠正时必须提供结构化值和原始值"});
});
