import{describe,expect,it}from"vitest";
import{deriveReleaseAssetState}from"./release-ingest-state-v3";

describe("v3 release ingest state",()=>{
  it("accepts a normally parsed asset without inventing a human decision",()=>{
    expect(deriveReleaseAssetState([{status:"success"}])).toEqual({processingStatus:"success",resolutionStatus:"accepted",humanDecisionRequired:false});
  });
  it("keeps any unconfirmed blank or failed unit pending",()=>{
    expect(deriveReleaseAssetState([{status:"success"},{status:"blank"}]).resolutionStatus).toBe("pending");
    expect(deriveReleaseAssetState([{status:"failed"}])).toEqual({processingStatus:"failed",resolutionStatus:"pending",humanDecisionRequired:true});
  });
  it("accepts only the exact confirmed exceptional units",()=>{
    expect(deriveReleaseAssetState([{status:"review-required",humanReviewDecision:"accept-candidate"}]))
      .toEqual({processingStatus:"review-required",resolutionStatus:"accepted",humanDecisionRequired:true});
    expect(deriveReleaseAssetState([{status:"blank",humanReviewDecision:"decorative-no-body"}]))
      .toEqual({processingStatus:"blank",resolutionStatus:"accepted",humanDecisionRequired:true});
  });
});
