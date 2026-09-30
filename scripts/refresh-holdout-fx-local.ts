/** Explicit local retry of the free official FX reference for MA24-12. */
import nextEnv from "@next/env";
import {ECB_SOURCE_KEY} from "../src/lib/billing/ecb-reference";
import {refreshBillingFxReference,readCurrentCnyFxReference} from "../src/lib/billing/fx-reference-repository";
import {getPool,transaction} from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
if(!process.env.HTTPS_PROXY?.startsWith("http://127.0.0.1:"))throw new Error("Local HTTPS proxy required");
try{
  const previous=await transaction(async client=>{
    const rows=await client.query<{status:string;next_attempt_at:Date}>(
      "select status,next_attempt_at from billing_reference_refresh_state where source_key=$1",[ECB_SOURCE_KEY]);
    if(rows.rows[0]?.status==="unavailable")await client.query(
      "update billing_reference_refresh_state set next_attempt_at=now() where source_key=$1 and status='unavailable'",[ECB_SOURCE_KEY]);
    return rows.rows[0]??null;
  });
  const result=await refreshBillingFxReference();
  const current=await readCurrentCnyFxReference();
  console.log(JSON.stringify({previousStatus:previous?.status??null,refreshStatus:result.status,
    freeHttpCalls:result.httpCalls,currentVersion:current?.version??null,
    currentAsOf:current?.asOf??null}));
  if(!current)process.exitCode=1;
}finally{await getPool().end();}
