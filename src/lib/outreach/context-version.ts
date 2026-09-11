import { createHash } from "node:crypto";
import type { CompanyRecord } from "@/lib/domain";

/** Business context only: changing a pipeline stage must not invalidate strategy. */
export function developmentContextVersion(company: CompanyRecord): string {
  return createHash("sha256").update(JSON.stringify({
    role:company.primaryBusinessRole,roles:[...company.roles].sort(),tier:company.accountTier,
    path:company.selectedCooperationPath,pathId:company.selectedPathId,supply:company.supplyModel,
    summary:company.summary,country:company.country,
    evidence:[...company.evidence].sort((a,b)=>a.id.localeCompare(b.id)),
  })).digest("hex");
}
