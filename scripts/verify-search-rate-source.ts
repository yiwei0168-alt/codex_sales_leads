import assert from "node:assert/strict";
import {SEARCH_RATE_SOURCES,fetchSearchRateEvidence} from "../src/lib/billing/search-rate-reference";

const items=await Promise.all(SEARCH_RATE_SOURCES.map(source=>fetchSearchRateEvidence(source)));
assert.ok(items.every(item=>item.status==="validated"),"An official Search price or credit value needs review");
console.log(JSON.stringify({sourceReview:"validated",items:items.map(item=>({sourceKey:item.sourceKey,
  status:item.status,sourceHash:item.sourceHash,bytes:item.bytes})),publicGets:items.length,
  paidSearchCalls:0,modelCalls:0,tariffAdmitted:false}));
