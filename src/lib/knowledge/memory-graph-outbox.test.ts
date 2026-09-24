import {beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mock.query}));
import {processMemoryGraphOutbox} from "./memory-graph-outbox";

const row={id:"observation-1",owner_id:"owner-1",kind:"preference",content:"Concise answers",
  recorded_at:new Date("2026-09-24T00:00:00Z"),valid_from:null,valid_until:null};
beforeEach(()=>mock.query.mockReset());

it("projects one authorized observation and marks its lease delivered",async()=>{
  mock.query.mockResolvedValueOnce([{observation_id:row.id}]).mockResolvedValueOnce([row])
    .mockResolvedValueOnce([{observation_id:row.id}]);
  const project=vi.fn().mockResolvedValue(undefined);
  expect(await processMemoryGraphOutbox(row.owner_id,row.id,project)).toBe("delivered");
  expect(project).toHaveBeenCalledWith(expect.objectContaining({ownerId:row.owner_id,observationId:row.id,
    content:row.content}));
  expect(mock.query).toHaveBeenCalledWith(row.owner_id,expect.stringContaining("lease_token=$3"),
    expect.arrayContaining([row.owner_id,row.id]));
  expect(mock.query).toHaveBeenCalledWith(row.owner_id,expect.stringContaining("delivered_at=now()"),
    expect.arrayContaining([row.id]));
});

it("does not project a receipt outside the account scope",async()=>{
  mock.query.mockResolvedValueOnce([]);
  const project=vi.fn();
  expect(await processMemoryGraphOutbox("other-owner",row.id,project)).toBe("busy");
  expect(project).not.toHaveBeenCalled();
});

it("requeues a local graph failure without marking delivered",async()=>{
  mock.query.mockResolvedValueOnce([{observation_id:row.id}]).mockResolvedValueOnce([row])
    .mockResolvedValueOnce([]);
  const project=vi.fn().mockRejectedValue(new Error("Neo4j unavailable"));
  expect(await processMemoryGraphOutbox(row.owner_id,row.id,project)).toBe("queued");
  expect(mock.query).toHaveBeenCalledWith(row.owner_id,expect.stringContaining("next_attempt_at=now()+interval '10 minutes'"),
    expect.arrayContaining([row.id]));
  expect(mock.query.mock.calls.some(([,sql])=>String(sql).includes("delivered_at=now()"))).toBe(false);
});
