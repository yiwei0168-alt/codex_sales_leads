import {beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mock.query}));
import {searchMemoryWithGraph} from "./memory-graph-search";

const id="11111111-1111-4111-8111-111111111114";
const now="2026-09-24T00:00:00Z";
beforeEach(()=>mock.query.mockReset());

it("revalidates graph IDs against tenant, business time, knowledge time and invalidation",async()=>{
  mock.query.mockResolvedValueOnce([{id,content:"Prefers concise answers"}]);
  const result=await searchMemoryWithGraph("owner-1","concise",now,now,{},async()=>[id]);
  expect(result.path).toBe("graph");
  const [tenant,sql,args]=mock.query.mock.calls[0];
  expect(tenant).toBe("owner-1");
  expect(sql).toContain("m.owner_id=$1");
  expect(sql).toContain("m.valid_from is null or m.valid_from<=$3");
  expect(sql).toContain("'unknown' else 'effective'");
  expect(sql).toContain("r.invalidates_id=m.id");
  expect(sql).toContain("position(lower($7) in lower(m.content))>0");
  expect(args[5]).toEqual([id]);
});

it("falls back to PostgreSQL when Neo4j is unavailable",async()=>{
  mock.query.mockResolvedValueOnce([{id,content:"Prefers concise answers"}]);
  const result=await searchMemoryWithGraph("owner-1","concise",now,now,{},async()=>{throw new Error("Neo4j down");});
  expect(result.path).toBe("postgres");
  expect(mock.query.mock.calls[0][2][5]).toBeNull();
});

it("falls back when a graph candidate is stale",async()=>{
  mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id,content:"Prefers concise answers"}]);
  const result=await searchMemoryWithGraph("owner-1","concise",now,now,{},async()=>[id]);
  expect(result.path).toBe("postgres");
  expect(mock.query).toHaveBeenCalledTimes(2);
});

it("rejects an invalid query before touching the graph or database",async()=>{
  const lookup=vi.fn();
  await expect(searchMemoryWithGraph("owner-1"," ",now,now,{},lookup)).rejects.toThrow("Invalid memory query");
  expect(lookup).not.toHaveBeenCalled();
  expect(mock.query).not.toHaveBeenCalled();
});
