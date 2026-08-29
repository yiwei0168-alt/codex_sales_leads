import { createHash } from "node:crypto";

import type { LeadEvidenceItem } from "./workflow/types";

export function leadEvidenceContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isCurrentLeadScoringEvidence(item: LeadEvidenceItem, runId: string): boolean {
  return item.sourceType !== "discovery" && item.evidenceRunId === runId
    && (item.freshnessStatus === "fresh" || item.freshnessStatus === "revalidated")
    && item.contentHash === leadEvidenceContentHash(item.excerpt);
}

export function leadEvidenceFreshnessReason(item: LeadEvidenceItem, runId: string): string {
  if (item.sourceType === "discovery") return "Discovery evidence is a search seed only.";
  if (item.evidenceRunId !== runId) return "Evidence belongs to a different run snapshot.";
  if (item.freshnessStatus !== "fresh" && item.freshnessStatus !== "revalidated") {
    return "Evidence was neither freshly acquired nor revalidated for this run.";
  }
  if (item.contentHash !== leadEvidenceContentHash(item.excerpt)) return "Evidence content hash is missing or invalid.";
  return "Evidence is eligible for current-run scoring.";
}
