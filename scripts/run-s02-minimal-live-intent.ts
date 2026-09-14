import nextEnv from "@next/env";
import assert from "node:assert/strict";

nextEnv.loadEnvConfig(process.cwd());
const {tenantQuery,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const {withSpendContext}=await import("../src/lib/billing/context");
const {processAssistantMessage}=await import("../src/lib/assistant/service");
const {getConversation}=await import("../src/lib/assistant/repository");
const userId="cbee9803-3c43-4609-9228-66086b207012";
const prompt="For isolated S02 product acceptance, find exactly one networking distributor in Colombia. The search queryLanguage must be es (Spanish). Keep only the Distributor role and one target company.";
const correction="For this S02 acceptance plan, keep Colombia, only Distributor and exactly one target. Set search queryLanguage to es (Spanish), not en. Please update the proposed plan.";
const title=prompt.slice(0,38);
const fxVersion="ecb-cny-usd-2026-09-11";
try{
  const identity=await tenantQuery<{safe:boolean}>(userId,`select
    (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe
    from app_user where id=$1`,[userId]);
  assert.equal(identity[0]?.safe,true);
  const before=await readSpendBudget(userId);
  assert.equal(before.budget?.limit_micros,"50000000");
  const existing=await tenantQuery<{id:string}>(userId,
    "select id from assistant_conversation where user_id=$1 and title=$2 order by created_at desc limit 1",
    [userId,title]);
  const correctLanguage=process.argv.includes("--correct-language");
  if(!process.argv.includes("--run")){
    console.log(JSON.stringify({mode:"preview-only",existingConversation:Boolean(existing[0]),
      limitUsd:50,occupiedUsd:Number(before.budget?.occupied_micros)/1e6,
      fxVersion,maximumNewPromptCount:correctLanguage&&existing[0]?1:existing[0]?0:1,providerCalls:0}));
  }else{
    const prior=existing[0]?await getConversation(userId,existing[0].id):null;
    const needsCorrection=correctLanguage&&prior?.actions.at(-1)?.payload.queryLanguage!=="es";
    if(correctLanguage&&(!prior||(needsCorrection&&prior.messages.length!==2)))
      throw new Error("Correction requires one existing isolated proposal");
    const conversation=needsCorrection
      ?await withSpendContext({userId,operationId:"s02-local-minimal-language-correction",stage:"validation",
          fixedFxReferenceVersion:fxVersion},()=>processAssistantMessage(userId,
          {conversationId:prior!.id,content:correction}))
      :prior??await withSpendContext({userId,operationId:"s02-local-minimal-intent",stage:"validation",
          fixedFxReferenceVersion:fxVersion},()=>processAssistantMessage(userId,{content:prompt}));
    assert.ok(conversation);
    const after=await readSpendBudget(userId);
    console.log(JSON.stringify({mode:needsCorrection?"real-plan-correction":existing[0]?"existing-no-replay":"single-real-intent",
      conversationId:conversation.id,messages:conversation.messages.length,
      actions:conversation.actions.map(action=>({id:action.id,status:action.status,plan:action.payload})),
      occupiedBeforeUsd:Number(before.budget?.occupied_micros)/1e6,
      occupiedAfterUsd:Number(after.budget?.occupied_micros)/1e6,
      remainingUsd:Number(after.budget?.remaining_micros)/1e6,
      unknownBills:after.stages.reduce((sum,row)=>sum+Number(row.unknown_bills),0)}));
  }
}finally{await getPool().end();}
