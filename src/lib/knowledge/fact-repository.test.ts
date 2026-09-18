import {beforeEach,describe,expect,it,vi} from "vitest";

const {queryMock}=vi.hoisted(()=>({queryMock:vi.fn()}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:queryMock}));

import {resolveVerifiedFacts} from "./fact-repository";

describe("v3 serving fact quarantine",()=>{
  beforeEach(()=>queryMock.mockReset());

  it("serves only verified facts without an open review from the active release",async()=>{
    queryMock.mockResolvedValueOnce([{releaseId:"release-v3"}]).mockResolvedValueOnce([]);
    await resolveVerifiedFacts("user-a","AP3000",["ethernet_port_count"]);
    const [userId,sql,parameters]=queryMock.mock.calls[1] as [string,string,unknown[]];
    expect(userId).toBe("user-a");
    expect(sql).toContain("f.release_id=$1");
    expect(sql).toContain("f.verification_status='verified'");
    expect(sql).toContain("q.fact_id=f.id and q.status='open'");
    expect(sql).not.toContain("'candidate'");
    expect(parameters).toEqual(["release-v3","AP3000",["ethernet_port_count"],"user-a"]);
  });
});
