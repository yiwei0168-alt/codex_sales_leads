import {expect,it} from "vitest";
import {summarizeRecoveryFamilyRows,type RecoveryFamilyRow} from "./recovery-family-summary";
const root:RecoveryFamilyRow={action_id:"root",root_action_id:"root",status:"completed",country_code:"CO",
  target_count:"5",accepted_count:"2",result_run_id:"run-root",run_id:"run-root",run_status:"completed",
  selected_domains:["www.alpha.com.co","beta.com.co"]};
const child:RecoveryFamilyRow={...root,action_id:"child",target_count:"3",accepted_count:"2",
  result_run_id:"run-child",run_id:"run-child",selected_domains:["https://alpha.com.co/","gamma.com.co"]};
it("counts unique company identity across completed runs and exposes duplicate slots",()=>{
  expect(summarizeRecoveryFamilyRows([root,child])).toEqual({rootActionId:"root",target:5,
    verifiedUniqueSaved:3,savedSlots:4,duplicateSavedSlots:1,remaining:2,pendingTasks:0,status:"verified"});
});
it("keeps an unfinished child pending while retaining the verified parent count",()=>{
  const pending={...child,status:"proposed",accepted_count:null,result_run_id:null,run_id:null,run_status:null,selected_domains:[]};
  expect(summarizeRecoveryFamilyRows([root,pending])).toMatchObject({status:"in-progress",verifiedUniqueSaved:2,
    remaining:3,pendingTasks:1});
});
it("does not infer zero from missing or mismatched completed history",()=>{
  for(const changed of [{...child,run_id:null},{...child,selected_domains:[]},{...child,accepted_count:null},
    {...child,country_code:"MX"},{...child,selected_domains:["invalid", "gamma.com.co"]},
    {...child,run_status:"running"}]){
    expect(summarizeRecoveryFamilyRows([root,changed])).toMatchObject({status:"unverifiable",verifiedUniqueSaved:null,remaining:null});
  }
});
it("does not generate a family summary for an unlinked task",()=>expect(summarizeRecoveryFamilyRows([root])).toBeNull());
