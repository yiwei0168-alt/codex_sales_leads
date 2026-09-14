import {z} from "zod";
import {currentSpendContext} from "./context";

export const PRODUCTION_FX_MAX_AGE_MS=7*24*60*60*1000;

const positiveInteger=z.string().regex(/^[1-9][0-9]{0,17}$/);
export const foreignCostBoundSchema=z.object({
  currency:z.string().regex(/^[A-Z]{3}$/).refine(value=>value!=="USD"),
  maximumNativeMicros:z.number().int().nonnegative().max(1_000_000_000_000),
  fx:z.object({usdNumerator:positiveInteger,nativeDenominator:positiveInteger,
    asOf:z.iso.datetime(),retrievedAt:z.iso.datetime(),reference:z.url(),version:z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/)}).strict(),
}).strict();
export type ForeignCostBound=z.infer<typeof foreignCostBoundSchema>;
export function foreignReservationMicros(bound:ForeignCostBound,now=Date.now()):number{
  const checked=foreignCostBoundSchema.parse(bound);
  const asOf=Date.parse(checked.fx.asOf),retrieved=Date.parse(checked.fx.retrievedAt);
  const fixedVersion=currentSpendContext()?.fixedFxReferenceVersion;
  if(asOf>now||retrieved>now||retrieved<asOf
    ||(fixedVersion!==checked.fx.version&&now-asOf>=PRODUCTION_FX_MAX_AGE_MS))
    throw new Error("FX observation expired or invalid");
  // Exact rational conversion + the approved 5% reservation-only FX buffer, rounded UP.
  const numerator=BigInt(checked.maximumNativeMicros)*BigInt(checked.fx.usdNumerator)*BigInt(105);
  const denominator=BigInt(checked.fx.nativeDenominator)*BigInt(100);
  const micros=(numerator+denominator-BigInt(1))/denominator;
  if(micros>BigInt(1_000_000_000_000))throw new Error("FX reservation exceeds supported amount");
  return Number(micros);
}
