import { expect,it } from "vitest";
import { assessmentDisplay } from "./assessment-display";
it("groups actual product dimensions and uses the saved policy, never current hardcoded weights",()=>{
  expect(assessmentDisplay({productFamilyMatch:20,customerAndScenarioOverlap:12,positioningCompatibility:8},{weights:{productAndUseCaseFit:50}})[0]).toMatchObject({score:40,maximum:50});
});
it("does not turn missing score/policy into zero or assume a policy version",()=>expect(assessmentDisplay({},null)[0]).toMatchObject({score:null,maximum:null}));
