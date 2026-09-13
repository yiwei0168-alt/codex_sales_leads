import {expect,it} from "vitest";
import {artifactObservations} from "./artifact-observations";
import {correctedCandidate,assessment} from "../../../../scripts/workflow-recovery-fixtures";

it("distinguishes server delivery from unobserved viewing/adoption and excludes incomplete corrections",()=>{
  const events=artifactObservations({countryCode:"CO",savedCount:1,assessments:[assessment],candidates:[correctedCandidate,
    {...correctedCandidate,correction:{...correctedCandidate.correction,primaryRole:"Unresolved"}},
    {...correctedCandidate,correction:{...correctedCandidate.correction,model:"deterministic-fallback"}}]});
  expect(events.find(event=>event.eventType==="valid")?.count).toBe(1);
  expect(events.filter(event=>event.stage==="persist_results").map(event=>[event.eventType,event.count]))
    .toEqual([["saved",1],["delivery-selected",1]]);
  expect(events.some(event=>["displayed","selected"].includes(event.eventType))).toBe(false);
  for(const event of events)expect(event.metadata).toMatchObject({actor:"system",countryCode:"CO",userAdoptedItems:null,uiViewedItems:null});
});
