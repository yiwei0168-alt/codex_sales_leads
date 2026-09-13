import nextEnv from "@next/env";
import assert from "node:assert/strict";
nextEnv.loadEnvConfig(process.cwd());
const {nativeModelBound}=await import("../src/lib/billing/native-model-bound");
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
try{
  const output=[];
  for(const model of ["kimi-k2.6","kimi-k3"]){
    const bound=await nativeModelBound({origin:"https://api.moonshot.cn",pathname:"/v1/chat/completions",model,requestBytes:1000,outputTokens:model==="kimi-k3"?12000:4000});
    assert.ok(bound?.rule.foreignCostBound);
    output.push({model,maximumUsd:bound.rule.maximumChargeMicros/1000000,maximumNativeMicros:bound.rule.foreignCostBound.maximumNativeMicros,
      currency:bound.rule.foreignCostBound.currency,fxVersion:bound.rule.foreignCostBound.fx.version,rateVersion:bound.version});
  }
  const rows=await tenantQuery<{limit_micros:string;occupied_micros:string}>("cbee9803-3c43-4609-9228-66086b207012",
    "select limit_micros::text,occupied_micros::text from user_spend_budget where user_id=$1",["cbee9803-3c43-4609-9228-66086b207012"]);
  assert.equal(rows[0]?.limit_micros,"30000000");
  console.log(JSON.stringify({status:"native-bounds-with-real-fx-read-passed",bounds:output,acceptanceOccupiedUsd:Number(rows[0].occupied_micros)/1000000,modelCalls:0,paidCalls:0,databaseWrites:0}));
}catch(error){console.error(JSON.stringify({status:"native-bound-verification-failed",errorClass:error instanceof Error?error.name:"UnknownError",paidCalls:0}));process.exitCode=1;}
finally{await getPool().end();}
