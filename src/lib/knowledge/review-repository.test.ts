import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:mocks.query,tenantTransaction:mocks.transaction}));
import {decideFactReview} from "./review-repository";

describe("fact review persistence",()=>{beforeEach(()=>{vi.clearAllMocks();mocks.transaction.mockImplementation(async(_user:string,run:(client:{query:typeof mocks.query})=>unknown)=>run({query:mocks.query}));});
  it.each([
    ["verify","verified","accepted"],["retain-candidate","candidate","accepted"],["reject","rejected","rejected"],
  ] as const)("maps %s to an audited %s fact",async(decision,factStatus,reviewStatus)=>{mocks.query.mockResolvedValueOnce({rows:[{factId:"fact-1",status:"open",attributeKey:"ethernet_port_count"}]});mocks.query.mockResolvedValue({rows:[]});await decideFactReview("admin",{reviewId:"review-1",decision,note:"checked"});const sql=mocks.query.mock.calls.map(call=>String(call[0]));expect(mocks.query.mock.calls[1][1][1]).toBe(reviewStatus);expect(sql.some(value=>value.includes(`verification_status='${factStatus}'`))).toBe(true);});
  it("stores a correction and verifies the corrected fact",async()=>{mocks.query.mockResolvedValueOnce({rows:[{factId:"fact-1",status:"open",attributeKey:"ethernet_port_count"}]});mocks.query.mockResolvedValue({rows:[]});await decideFactReview("admin",{reviewId:"review-1",decision:"correct",note:"datasheet row checked",correctedRawValue:"8 ports",correctedValue:8,correctedUnit:"port"});expect(mocks.query.mock.calls[1][1][1]).toBe("corrected");expect(mocks.query.mock.calls[2][1]).toEqual(["fact-1","8","8 ports","port"]);});
  it("refuses stale decisions without writing",async()=>{mocks.query.mockResolvedValueOnce({rows:[{factId:"fact-1",status:"accepted",attributeKey:"ethernet_port_count"}]});await expect(decideFactReview("admin",{reviewId:"review-1",decision:"verify",note:""})).rejects.toThrow("review-already-resolved");expect(mocks.query).toHaveBeenCalledOnce();});
});
