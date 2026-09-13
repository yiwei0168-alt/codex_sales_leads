import {afterEach,expect,it,vi} from "vitest";
import {TEXT_OUTPUT_LIMITS,textOutputLimit,textOutputCompletion} from "./text-output-policy";
afterEach(()=>vi.unstubAllEnvs());
it("uses stage-specific limits and rejects invalid overrides",()=>{
  expect(TEXT_OUTPUT_LIMITS).toEqual({"rag-answer":8192,"hybrid-synthesis":8192,"lead-playbook":4096,
    "compatible-correction":8192,"compatible-review":8192,"compatible-judge":12000,"compatible-scoring":8192});
  vi.stubEnv("LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS","6000");expect(textOutputLimit("lead-playbook")).toBe(6000);
  for(const value of ["0","-1","1.5","Infinity","1000001"]){vi.stubEnv("LEAD_PLAYBOOK_MAX_OUTPUT_TOKENS",value);expect(()=>textOutputLimit("lead-playbook")).toThrow();}
});
it("rejects truncated JSON, missing stop, refusals, missing text and multiple choices",()=>{
  const good={choices:[{finish_reason:"stop",message:{content:'{"valid":"json"}'}}]};
  expect(textOutputCompletion("lead-playbook",good)).toBe("complete");
  for(const value of [{choices:[{...good.choices[0],finish_reason:"length"}]},{choices:[{message:{content:"answer"}}]},
    {choices:[{finish_reason:"stop",message:{content:"answer",refusal:"cannot"}}]}, {choices:[{finish_reason:"stop",message:{content:" "}}]},
    {choices:[...good.choices,...good.choices]},{}])expect(textOutputCompletion("rag-answer",value)).toBe("incomplete");
  expect(textOutputCompletion("rag-embedding",{})).toBeUndefined();
});
