import nextEnv from "@next/env";
import assert from "node:assert/strict";

nextEnv.loadEnvConfig(process.cwd());
const {query,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget,setSpendBudget}=await import("../src/lib/billing/repository");
const userId="cbee9803-3c43-4609-9228-66086b207012";
try{
  const identity=await query<{safe:boolean}>(`select (email='model-acceptance-20260912@fixture.invalid'
    and status='disabled' and password_hash is null) as safe from app_user where id=$1`,[userId]);
  assert.equal(identity[0]?.safe,true,"Local isolated acceptance identity changed");
  const before=await readSpendBudget(userId);
  assert.ok(before.budget,"Existing acceptance budget required");
  const priorLimit=BigInt(before.budget.limit_micros);
  const occupied=BigInt(before.budget.occupied_micros);
  assert.ok(priorLimit===BigInt(30_000_000)||priorLimit===BigInt(50_000_000),"Unexpected preexisting ceiling");
  assert.ok(occupied<=BigInt(50_000_000),"Historical occupancy already exceeds approved ceiling");
  if(priorLimit!==BigInt(50_000_000))await setSpendBudget(userId,50_000_000);
  const after=await readSpendBudget(userId);
  assert.ok(after.budget);
  assert.equal(after.budget.limit_micros,"50000000");
  assert.equal(after.budget.occupied_micros,before.budget.occupied_micros);
  console.log(JSON.stringify({mode:"authorized-local-acceptance-budget-change",
    priorLimitUsd:Number(priorLimit)/1e6,newLimitUsd:50,occupiedUsd:Number(occupied)/1e6,
    remainingUsd:Number(after.budget.remaining_micros)/1e6,
    historicalOccupancyPreserved:true,paidCalls:0,jobsClaimed:0}));
}finally{await getPool().end();}
