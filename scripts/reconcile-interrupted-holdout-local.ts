/** Convert one abandoned MA24-12 transport reservation to unknown, without replay. */
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {settlePaidCall} from "../src/lib/billing/repository";
import {getPool,tenantQuery} from "../src/lib/rag/db";
nextEnv.loadEnvConfig(process.cwd());
const operationId="ma24-holdout-711ed12f970c54d7";
const stage="ma24-holdout:base-45-ports:v3";
const client=await getPool().connect();let locked=false;
try{
  const result=await client.query<{locked:boolean}>(
    "select pg_try_advisory_lock(hashtextextended($1,0)) locked",[operationId]);
  if(!result.rows[0].locked)throw new Error("Evaluation runner is still active");locked=true;
  const rows=await tenantQuery<{id:string;status:string;created_at:string}>(OWNER_USER_ID,
    `select id,status,created_at::text from paid_call_reservation
      where user_id=$1 and operation_id=$2 and stage=$3`,[OWNER_USER_ID,operationId,stage],"admin");
  if(rows.length!==1||rows[0].status!=="reserved"
    ||Date.now()-Date.parse(rows[0].created_at)<120_000)
    throw new Error("Exactly one aged, still reserved transport required");
  await settlePaidCall(OWNER_USER_ID,rows[0].id,{reportedMicros:null,latencyMs:0,
    responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false});
  const [after]=await tenantQuery<{status:string}>(OWNER_USER_ID,
    "select status from paid_call_reservation where user_id=$1 and id=$2",[OWNER_USER_ID,rows[0].id],"admin");
  if(after?.status!=="unknown")throw new Error("Interrupted attempt was not retained as unknown");
  console.log(JSON.stringify({operationId,stage,status:after.status,replayed:false,
    conservativeNativeBoundRetained:true}));
}finally{
  if(locked)await client.query("select pg_advisory_unlock(hashtextextended($1,0))",[operationId]);
  client.release();await getPool().end();
}
