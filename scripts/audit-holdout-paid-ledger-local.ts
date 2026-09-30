/** Read-only MA24-12 receipt audit; never prints request bodies or provider credentials. */
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
nextEnv.loadEnvConfig(process.cwd());
const operationId="ma24-holdout-711ed12f970c54d7";
try{
  const rows=await tenantQuery<{stage:string;status:string;tariff_key:string;reserved_micros:string;occupied_micros:string|null;cost_bound_known:boolean;override_rule:string|null;
    valid_output_items:number|null;output_incomplete:boolean|null;http_status:number|null;
    settled_source:string|null;created_at:string;updated_at:string}>(OWNER_USER_ID,
    `select stage,status,tariff_key,reserved_micros::text,occupied_micros::text,cost_bound_known,
      metrics->'admissionOverride'->>'ruleId' override_rule,
      (metrics->>'validOutputItems')::int valid_output_items,
      (metrics->>'outputIncomplete')::boolean output_incomplete,
      (metrics->'providerUsage'->>'httpStatus')::int http_status,
      settled_source,created_at::text,updated_at::text
     from paid_call_reservation where user_id=$1 and operation_id=$2 order by created_at,id`,
    [OWNER_USER_ID,operationId],"admin");
  console.log(JSON.stringify({operationId,count:rows.length,rows}));
}finally{await getPool().end();}
