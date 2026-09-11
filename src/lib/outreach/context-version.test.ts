import { expect,it } from "vitest";
import type { CompanyRecord } from "@/lib/domain";
import { developmentContextVersion } from "./context-version";
const company={roles:["SI"],evidence:[],primaryBusinessRole:"SI",accountTier:"KA",summary:"Network projects"} as unknown as CompanyRecord;
it("invalidates changed business context without charging a model",()=>{
  expect(developmentContextVersion(company)).not.toBe(developmentContextVersion({...company,accountTier:"Standard"} as CompanyRecord));
  expect(developmentContextVersion(company)).toBe(developmentContextVersion({...company,opportunityStage:"Contacted"}));
});
