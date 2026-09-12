export type CostObservationKind="usage-estimate"|"provider-report"|"invoice"|"verified-unbilled";
export interface CostObservation {
  kind:CostObservationKind;
  amountMicros:number|null;
  complete:boolean;
  uniquelyMatched:boolean;
}
export interface CostOccupancy {
  reservedMicros:number;
  occupiedMicros?:number;
  settledMicros:number|null;
  settledSource:CostObservationKind|null;
}
function amount(value:number|null){
  if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>1_000_000_000_000))throw new Error("Invalid micro-USD amount");
}
/** Receives an independently verified match, not a model's confidence or a user's numeric assertion. */
export function planCostReconciliation(current:CostOccupancy,observation:CostObservation){
  amount(current.reservedMicros);amount(current.settledMicros);amount(observation.amountMicros);amount(current.occupiedMicros??null);
  if(observation.kind==="verified-unbilled"&&observation.amountMicros!==0)throw new Error("Verified unbilled observations must explicitly report zero");
  const before=current.occupiedMicros??current.settledMicros??current.reservedMicros;
  const canSettle=observation.kind!=="usage-estimate"&&observation.amountMicros!==null
    &&observation.complete&&observation.uniquelyMatched
    &&(current.settledSource!=="invoice"||observation.kind==="invoice");
  const settledMicros=canSettle?observation.amountMicros:current.settledMicros;
  const suspendRule=observation.kind!=="usage-estimate"&&observation.amountMicros!==null&&observation.amountMicros>current.reservedMicros;
  const after=canSettle?settledMicros!:suspendRule&&current.settledSource!=="invoice"
    ?Math.max(before,observation.amountMicros!):before;
  return {settledMicros,settledSource:canSettle?observation.kind:current.settledSource,
    occupiedBefore:before,occupiedAfter:after,occupiedDelta:after-before,
    // A reported overrun is a safety warning even before it qualifies for release.
    suspendRule,
    releasedMicros:Math.max(0,before-after),canSettle};
}
