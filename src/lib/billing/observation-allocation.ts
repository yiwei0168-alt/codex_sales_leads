import {allocateCompanyCost,costAttributionSchema} from "./cost-allocation";
import type {CostObservationKind} from "./reconciliation-policy";

/** Read only stored provenance, not whichever company context happens to ingest a late invoice. */
export function observationCostAllocation(input:{kind:CostObservationKind;amountMicros:number|null;
  reservationMetrics:unknown;occupiedBefore:number;occupiedAfter:number}){
  const metrics=typeof input.reservationMetrics==="object"&&input.reservationMetrics!==null
    ?input.reservationMetrics as Record<string,unknown>:{};
  const parsed=costAttributionSchema.safeParse(metrics.costAttribution);
  const attribution=parsed.success?parsed.data:null;
  // A verified-unbilled event is not an invoice: preserve its separate existing kind and zero amount.
  const basis=input.kind==="usage-estimate"?"estimate":input.kind==="verified-unbilled"?null:input.kind;
  return {version:"cost-observation-allocation-v1",attributionStatus:parsed.success?"recorded":"missing-or-invalid",
    observation:basis?allocateCompanyCost({basis,amountMicros:input.amountMicros,attribution}):null,
    occupiedBefore:allocateCompanyCost({basis:"occupied",amountMicros:input.occupiedBefore,attribution}),
    occupiedAfter:allocateCompanyCost({basis:"occupied",amountMicros:input.occupiedAfter,attribution}),
    usageBoundary:"same-reservation-cost-bases-not-additional-spend-or-user-adoption"};
}
