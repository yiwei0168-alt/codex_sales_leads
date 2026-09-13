import nextEnv from "@next/env";
import assert from "node:assert/strict";
nextEnv.loadEnvConfig(process.cwd());
const {query,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const userId="cbee9803-3c43-4609-9228-66086b207012";
try{
  const identity=await query<{safe:boolean}>("select (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe from app_user where id=$1",[userId]);
  assert.equal(identity[0]?.safe,true);
  const status=await readSpendBudget(userId);
  assert.ok(status.budget);
  assert.equal(String(status.budget.limit_micros),"30000000");
  console.log(JSON.stringify({readOnly:true,limitUsd:Number(status.budget.limit_micros)/1e6,
    occupiedUsd:Number(status.budget.occupied_micros)/1e6,remainingUsd:Number(status.budget.remaining_micros)/1e6,
    frozen:status.budget.frozen,unsettledCalls:status.stages.reduce((sum,row)=>sum+Number(row.unsettled_calls),0),
    unknownBills:status.stages.reduce((sum,row)=>sum+Number(row.unknown_bills),0),newProviderCalls:0}));
}finally{await getPool().end();}
