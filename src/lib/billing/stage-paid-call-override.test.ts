import {afterEach,describe,expect,it,vi} from "vitest";
import {currentStagePaidCallOverride} from "./stage-paid-call-override";

describe("currentStagePaidCallOverride",()=>{
  afterEach(()=>vi.unstubAllEnvs());

  it("requires both the exact confirmed rule and exact owner",()=>{
    vi.stubEnv("PAID_CALL_STAGE_OVERRIDE","A33");
    vi.stubEnv("PAID_CALL_STAGE_OVERRIDE_USER_ID","owner");
    expect(currentStagePaidCallOverride("owner")).toEqual({ruleId:"A33",allowBudgetOverage:true,allowUnknownReplay:true,
      allowFinancialAdmissionBypass:true});
    expect(currentStagePaidCallOverride("other")).toBeNull();
  });

  it("stays disabled for absent or different rule identifiers",()=>{
    vi.stubEnv("PAID_CALL_STAGE_OVERRIDE_USER_ID","owner");
    expect(currentStagePaidCallOverride("owner")).toBeNull();
    vi.stubEnv("PAID_CALL_STAGE_OVERRIDE","A29");
    expect(currentStagePaidCallOverride("owner")).toBeNull();
  });
});
