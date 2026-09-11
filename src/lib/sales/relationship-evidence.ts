import { createHash } from "node:crypto";
import type { CompanyRecord } from "@/lib/domain";
export function relationshipEvidenceFingerprint(records:CompanyRecord[]){
  return createHash('sha256').update(JSON.stringify(records.map(record=>({id:record.id,evidence:record.evidence??[]})).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
}
export function relationshipCitationValid(quote:string,evidenceId:string,records:CompanyRecord[]){
  if(quote.trim().length<12)return false;
  return records.some(record=>record.evidence.some(evidence=>evidence.id===evidenceId&&['Verified','Corroborated'].includes(evidence.status)
    && `${evidence.claim}\n${evidence.summary}`.includes(quote)&&/^https?:\/\//i.test(evidence.sourceUrl)));
}
