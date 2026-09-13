import {expect,it} from "vitest";
import snapshot from "../../../docs/OPENROUTER_ROUTE_ENDPOINT_EVIDENCE_2026-09-14.json";
import {auditPublicReviewBound,conservativeStandardBoundMicros,type PublicModel} from "./openrouter-public-audit";
const base=snapshot.models.find(model=>model.id==="openai/gpt-5.6-terra") as PublicModel;
const clone=()=>structuredClone(base);
it("recomputes the review proposal from every standard endpoint and keeps it unadmitted",()=>{
  expect(conservativeStandardBoundMicros(base,8192)).toBe(11019202);
  expect(auditPublicReviewBound(base,clone(),8192,11019202)).toMatchObject({
    status:"unchanged-proposal-only",sourceUnchanged:true,currentMaximumMicros:11019202,
    tariffAdmitted:false,paidCalls:0});
});
it("requires review for price, route or capability changes even when a ceiling remains sufficient",()=>{
  const cheaper=clone();cheaper.endpoints[1].pricing.prompt="0.000001";
  expect(auditPublicReviewBound(base,cheaper,8192,11019202).status).toBe("review-required");
  const extra=clone();extra.endpoints.push({...extra.endpoints[1],tag:"new-provider"});
  expect(auditPublicReviewBound(base,extra,8192,11019202).status).toBe("review-required");
  const capability=clone();capability.endpoints[1].supportedParameters=[];
  expect(auditPublicReviewBound(base,capability,8192,11019202).status).toBe("review-required");
});
it("fails closed on unknown or increased charges and incomplete endpoint evidence",()=>{
  const expensive=clone();expensive.endpoints[1].pricing.completion="0.0001";
  expect(auditPublicReviewBound(base,expensive,8192,11019202)).toMatchObject({status:"review-required",sourceUnchanged:false});
  expect(conservativeStandardBoundMicros(expensive,8192)).toBeGreaterThan(11019202);
  const missing=clone();delete missing.endpoints[1].pricing.input_cache_write;
  expect(()=>conservativeStandardBoundMicros(missing,8192)).toThrow("Unverifiable endpoint price");
  const duplicate=clone();duplicate.endpoints[1].tag=duplicate.endpoints[2].tag;
  expect(()=>conservativeStandardBoundMicros(duplicate,8192)).toThrow("Ambiguous endpoint tags");
  const fast=clone();fast.endpoints.find(item=>item.tag==="openai/fast")!
    .supportedParameters.push("max_completion_tokens");
  expect(()=>conservativeStandardBoundMicros(fast,8192)).toThrow("Excluded endpoint can serve the review request");
  expect(auditPublicReviewBound(base,clone(),8192,11019201).status).toBe("bound-insufficient");
});
