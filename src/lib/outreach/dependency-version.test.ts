import {expect,it,vi} from "vitest";
const query=vi.hoisted(()=>vi.fn().mockResolvedValue([{version:"hash"}]));vi.mock("@/lib/rag/db",()=>({tenantQuery:query}));
import {developmentDependencyVersion} from "./dependency-version";
it("hashes owner-visible revisions including deletions and state changes without embedding",async()=>{
  expect(await developmentDependencyVersion("owner")).toBe("hash");const sql=query.mock.calls[0][1] as string;expect(sql).toContain("user_id=$1");expect(sql).toContain("owner_id=$1 or visibility='shared'");expect(sql).toContain("user_channel_relationship");expect(sql).toContain("order by part");
});
