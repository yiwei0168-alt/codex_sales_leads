/** Separate observations, never additive. Nullable sums carry explicit coverage. */
export interface CostStageSummary {
  stage:string;calls:number;reserved_micros:string;occupied_micros:string;
  estimated_micros:string|null;reported_micros:string|null;invoice_micros:string|null;
  estimated_calls:number;reported_calls:number;invoice_calls:number;unreconciled_calls:number;
  unknown_bills:number;summed_latency_ms?:string|null;
}
export const COST_SUMMARY_SQL=`sum(coalesce(occupied_micros,reserved_micros))::text as occupied_micros,
  sum(estimated_micros)::text as estimated_micros,sum(invoice_micros)::text as invoice_micros,
  count(estimated_micros)::int as estimated_calls,count(reported_micros)::int as reported_calls,
  count(invoice_micros)::int as invoice_calls,count(*) filter(where settled_micros is null)::int as unreconciled_calls`;
