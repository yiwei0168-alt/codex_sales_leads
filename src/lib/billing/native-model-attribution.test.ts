import {afterEach,expect,it,vi} from "vitest";
import {currentModelAttempt,modelAttemptSequence, type ModelAttemptContext} from "./model-attempt-context";
import {BudgetDeniedError} from "./policy";
import {planAssistantRequest} from "@/lib/assistant/intent-agent";
import {generateFollowUp} from "@/lib/outreach/kimi-agent";
afterEach(()=>vi.unstubAllEnvs());

it("shares one native invocation ID across actual attempts and isolates another invocation",async()=>{
  const metadata={provider:"fixture",task:"fixture",promptVersion:"v1"};
  const first=modelAttemptSequence(metadata),second=modelAttemptSequence(metadata);
  const observed:ModelAttemptContext[]=[];
  const capture=async()=>{await Promise.resolve();observed.push({...currentModelAttempt()!});};
  await first(capture);await first(capture);await second(capture);
  expect(observed.map(item=>item.attempt)).toEqual([1,2,1]);
  expect(observed[0].invocationId).toBe(observed[1].invocationId);
  expect(observed[2].invocationId).not.toBe(observed[0].invocationId);
  expect(currentModelAttempt()).toBeUndefined();
});

it("attributes the real intent and follow-up adapters without altering requests or swallowing budget stops",async()=>{
  vi.stubEnv("KIMI_API_KEY","fixture");
  const stopped=new BudgetDeniedError("missing-tariff");
  const calls:ModelAttemptContext[]=[];
  const transport=vi.fn<typeof fetch>(async(_url,init)=>{
    calls.push({...currentModelAttempt()!});
    expect(String(init?.body)).not.toContain("invocationId");
    throw stopped;
  });
  await expect(planAssistantRequest("Find distributors",[],transport)).rejects.toBe(stopped);
  await expect(generateFollowUp({instructions:"Follow up",originalSubject:"Hello",originalBody:"Dear partner"},transport)).rejects.toBe(stopped);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({provider:"kimi",promptVersion:"assistant-intent-plan-v1.3",attempt:1});
  expect(calls[1]).toMatchObject({provider:"kimi",task:"outreach-follow-up",promptVersion:"outreach-follow-up-v1",attempt:1});
  expect(calls[0].invocationId).not.toBe(calls[1].invocationId);
});
