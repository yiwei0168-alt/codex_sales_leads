import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const {refreshBillingFxReference,readBillingReferenceStatus}=await import("../src/lib/billing/fx-reference-repository");
const {getPool}=await import("../src/lib/rag/db");
try{
  const refresh=await refreshBillingFxReference();
  const status=await readBillingReferenceStatus();
  console.log(JSON.stringify({refresh,status,paidProviderCalls:0,jobsClaimed:0}));
}finally{await getPool().end();}
