import { allocateCompanyCost, costAttributionSchema, type AllocationBasis } from "./cost-allocation";
import { taskCostCompletionSchema } from "./task-cost-completion";

export const companyCostBases = ["reservation","occupied","estimate","provider-report","invoice"] as const;
export type CostCoverage = { amountMicros: number | null; knownCalls: number; calls: number };
export type CompanyCostSummary = { companyKey: string | null; domain?: string; countryCode?: string;
  costs: Record<AllocationBasis, CostCoverage> };
export interface CompanyCostSource {
  reserved_micros: string; occupied_micros: string | null; estimated_micros: string | null;
  reported_micros: string | null; invoice_micros: string | null; metrics: unknown;
}
/** Current projection of each reservation exactly once; never sum its successive observations. */
export function summarizeCompanyCosts(sources: CompanyCostSource[]): CompanyCostSummary[] {
  const rows = new Map<string | null, CompanyCostSummary>();
  function row(key: string | null) {
    if (!rows.has(key)) rows.set(key,{companyKey:key,costs:Object.fromEntries(companyCostBases.map(basis=>
      [basis,{amountMicros:null,knownCalls:0,calls:0}])) as CompanyCostSummary["costs"]});
    return rows.get(key)!;
  }
  for (const source of sources) {
    const metrics=source.metrics&&typeof source.metrics==="object"?source.metrics as Record<string,unknown>:{};
    const parsed=costAttributionSchema.safeParse(metrics.costAttribution);
    const attribution=parsed.success?parsed.data:null;
    const completion=taskCostCompletionSchema.safeParse(metrics.costAllocationCompletion);
    const completedTask=completion.success&&completion.data.roundKey===attribution?.roundKey?completion.data:undefined;
    const population=allocateCompanyCost({basis:"reservation",amountMicros:0,attribution,completedTask});
    const keys:(string|null)[]=population.shares.length?population.shares.map(share=>share.companyKey):[null];
    const amounts:Record<AllocationBasis,string|null>={reservation:source.reserved_micros,
      occupied:source.occupied_micros??source.reserved_micros,estimate:source.estimated_micros,
      "provider-report":source.reported_micros,invoice:source.invoice_micros};
    for (const basis of companyCostBases) {
      const value=amounts[basis];
      const allocation=allocateCompanyCost({basis,amountMicros:value===null?null:Number(value),attribution,completedTask});
      const shares=new Map(allocation.shares.map(share=>[share.companyKey,share.amountMicros]));
      for (const key of keys) {
        const target=row(key).costs[basis]; target.calls++;
        const amount=key===null?allocation.unallocatedMicros:shares.get(key)??null;
        if(amount!==null){target.knownCalls++;target.amountMicros=(target.amountMicros??0)+amount;
          if(!Number.isSafeInteger(target.amountMicros))throw new Error("Company cost total exceeds safe range");}
      }
    }
  }
  return [...rows.values()].sort((a,b)=>(a.companyKey??"~").localeCompare(b.companyKey??"~"));
}
