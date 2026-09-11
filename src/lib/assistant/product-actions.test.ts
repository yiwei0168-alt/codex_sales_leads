import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({query:vi.fn().mockResolvedValue([])}));
vi.mock("@/lib/rag/db",()=>({tenantQuery:m.query}));
import {findProductActionCompanies} from "./product-actions";
it("binds owner and literal search text without external calls",async()=>{
  await findProductActionCompanies("owner",{kind:"library",companyQuery:"a%b_",countryCode:"MX",roles:["Retailer"]});
  expect(m.query).toHaveBeenCalledWith("owner",expect.stringContaining("w.owner_id=$1"),["owner","%a\\%b\\_%","MX",["Retailer"]]);
});
