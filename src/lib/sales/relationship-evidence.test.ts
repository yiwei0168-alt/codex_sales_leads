import { expect,it } from "vitest";
import type { CompanyRecord } from "@/lib/domain";
import { relationshipCitationValid,relationshipEvidenceFingerprint } from "./relationship-evidence";
const record={id:"a",evidence:[{id:"ev",claim:"A distributes products to B in this market",summary:"Source summary",status:"Verified",sourceUrl:"https://example.com"}]} as CompanyRecord;
it("accepts only exact quotes from verified saved evidence",()=>{
  expect(relationshipCitationValid("A distributes products to B","ev",[record])).toBe(true);
  expect(relationshipCitationValid("A supplies all companies nationwide","ev",[record])).toBe(false);
  expect(relationshipCitationValid("A distributes products to B","wrong",[record])).toBe(false);
  expect(relationshipCitationValid("A distributes products to B","ev",[{...record,evidence:record.evidence.map(item=>({...item,status:"Inferred"}))}])).toBe(false);
});
it("keeps pair hash order stable and changes only with evidence, not role edits",()=>{
  const other={id:"b",evidence:[]} as unknown as CompanyRecord;
  expect(relationshipEvidenceFingerprint([record,other])).toBe(relationshipEvidenceFingerprint([other,{...record,primaryBusinessRole:"SI"}]));
  expect(relationshipEvidenceFingerprint([record,other])).not.toBe(relationshipEvidenceFingerprint([{...record,evidence:[]},other]));
});
