import {z} from "zod";

export const COST_ALLOCATION_VERSION="company-cost-allocation-v1";
const companyKey=z.string().regex(/^[a-f0-9]{64}$/);
export const costAttributionSchema=z.object({
  version:z.literal("company-cost-attribution-v1"),
  roundKey:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  kind:z.enum(["company-inputs","task-shared","unclassified"]),
  companyKeys:z.array(companyKey).max(10000),
}).strict().superRefine((value,ctx)=>{
  if(value.kind==="company-inputs"&&!value.companyKeys.length)ctx.addIssue({code:"custom",message:"Actual company inputs required"});
  if(value.kind!=="company-inputs"&&value.companyKeys.length)ctx.addIssue({code:"custom",message:"Only explicit company inputs carry company keys"});
  if(new Set(value.companyKeys).size!==value.companyKeys.length)ctx.addIssue({code:"custom",message:"Duplicate company keys"});
});
export type CostAttribution=z.infer<typeof costAttributionSchema>;
export type AllocationBasis="reservation"|"estimate"|"provider-report"|"invoice"|"occupied";

/** An accounting projection, never a new expense or permission to release a reservation. */
export function allocateCompanyCost(input:{basis:AllocationBasis;amountMicros:number|null;
  attribution:CostAttribution|null;completedTask?:{roundKey:string;processedCompanyKeys:string[]}}){
  if(!["reservation","estimate","provider-report","invoice","occupied"].includes(input.basis))throw new Error("Invalid cost basis");
  if(input.amountMicros!==null&&(!Number.isSafeInteger(input.amountMicros)||input.amountMicros<0||input.amountMicros>1_000_000_000_000))throw new Error("Invalid micro-USD cost");
  const attribution=input.attribution?costAttributionSchema.parse(input.attribution):null;
  let keys:string[]=[];let method:"unattributed"|"task-pending"|"zero-company-task"|"direct"|"batch-equal"|"task-equal"="unattributed";
  if(attribution?.kind==="company-inputs"){
    keys=[...attribution.companyKeys].sort();method=keys.length===1?"direct":"batch-equal";
  }else if(attribution?.kind==="task-shared"){
    method="task-pending";
    if(input.completedTask){
      if(!attribution.roundKey||attribution.roundKey!==input.completedTask.roundKey)throw new Error("Cost allocation round mismatch");
      keys=[...new Set(z.array(companyKey).max(10000).parse(input.completedTask.processedCompanyKeys))].sort();
      method=keys.length?"task-equal":"zero-company-task";
    }
  }
  const amount=input.amountMicros;
  const shares=amount===null?[]:keys.map((key,index)=>({companyKey:key,
    amountMicros:Math.floor(amount/keys.length)+(index<amount%keys.length?1:0)}));
  const unallocatedMicros=amount===null?null:keys.length?0:amount;
  if(amount!==null&&shares.reduce((sum,row)=>sum+row.amountMicros,unallocatedMicros??0)!==amount)throw new Error("Cost allocation conservation failed");
  return {version:COST_ALLOCATION_VERSION,basis:input.basis,sourceAmountMicros:amount,roundKey:attribution?.roundKey??null,
    method,shares,unallocatedMicros,amountKnown:amount!==null,additionalSpendMicros:0 as const};
}
