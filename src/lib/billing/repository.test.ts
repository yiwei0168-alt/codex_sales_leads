import {beforeEach,expect,it,vi} from "vitest";
const query=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/rag/db",()=>({tenantQuery:vi.fn(),tenantTransaction:async(_u:string,run:(c:unknown)=>unknown)=>run({query})}));
import {reservePaidCall,settlePaidCall} from "./repository";
const input={operationId:"operation",stage:"score",tariffKey:"rule",tariffVersion:"v1",maximumChargeMicros:10,requestBytes:100};
beforeEach(()=>query.mockReset());
it("locks budget before reserving and refuses a concurrent caller's reduced remainder",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"95",frozen:false}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("budget-exhausted");expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain("for update");
});
it("atomically records the reservation before increasing occupied amount",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"100",occupied_micros:"90",frozen:false}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:"reserve"}]}).mockResolvedValue({rows:[]});
  expect(await reservePaidCall("owner",input)).toBe("reserve");expect(query.mock.calls[3][1]).toEqual(["owner",10]);
});
it("enforces the task cap even when the owner has spare budget",async()=>{
  query.mockResolvedValueOnce({rows:[{limit_micros:"1000",occupied_micros:"20",frozen:false}]}).mockResolvedValueOnce({rows:[{limit_micros:"25",occupied_micros:"20"}]});
  await expect(reservePaidCall("owner",input)).rejects.toThrow("task-budget-exhausted");expect(query).toHaveBeenCalledTimes(2);
});
it("retains unknown charges and freezes future calls if reported charge violates bound",async()=>{
  query.mockResolvedValue({rows:[{reserved_micros:"10"}]});
  await settlePaidCall("owner","id",{reportedMicros:null,latencyMs:1,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false});
  expect(query).toHaveBeenCalledTimes(1);
  await settlePaidCall("owner","id",{reportedMicros:11,latencyMs:1,responseBytes:5,inputTokens:1,outputTokens:1,succeeded:true});
  expect(query.mock.calls.at(-1)?.[0]).toContain("frozen=true");
  expect(query.mock.calls.some(([sql])=>String(sql).includes("occupied_micros-"))).toBe(false);
});
