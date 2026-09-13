import { describe, expect, it } from "vitest";
import { persistenceInputFingerprint as fingerprint } from "./persistence-identity";
import { resultPersistenceFingerprint } from "./persistence-identity";
import { completedStageMetric } from "./workflow-telemetry";

describe("persisted result identity", () => {
  it("ignores only the retried persistence node timing while retaining business and other stage observations", () => {
    const metric=completedStageMetric({stage:"persist_results",startedAt:1,input:[],output:{expectedResult:true}});
    const input={countryCode:"CO",requested:1,stageMetrics:[metric]};
    const later={...metric,startedAt:new Date(2000).toISOString(),completedAt:new Date(3000).toISOString()};
    expect(resultPersistenceFingerprint({...input,stageMetrics:[later]})).toBe(resultPersistenceFingerprint(input));
    for (const changed of [{...input,countryCode:"MX"},{...input,requested:2},
      {...input,stageMetrics:[{...later,inputItems:2}]},{...input,stageMetrics:[{...later,metadata:{retries:1}}]}]) {
      expect(resultPersistenceFingerprint(changed)).not.toBe(resultPersistenceFingerprint(input));
    }
    expect(resultPersistenceFingerprint({...input,stageMetrics:[{...metric,stage:"score_candidates"}]}))
      .not.toBe(resultPersistenceFingerprint({...input,stageMetrics:[{...later,stage:"score_candidates"}]}));
  });
  it("survives JSON round trips and nested object key reordering", () => {
    expect(fingerprint({a:1,b:{x:2,y:3},unused:undefined})).toBe(fingerprint({b:{y:3,x:2},a:1}));
  });
  it("distinguishes result order, nulls, country and score changes", () => {
    const input={country:"CO",scores:[1,2],value:null};
    for(const changed of [{...input,country:"MX"},{...input,scores:[2,1]},
      {...input,scores:[1,3]},{...input,value:undefined}]) {
      expect(fingerprint(changed)).not.toBe(fingerprint(input));
    }
  });
});
