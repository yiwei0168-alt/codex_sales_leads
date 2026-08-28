import { createHash } from "node:crypto";

import type {
  CorrectedLeadWorkflowCandidate,
  LeadAssessmentReview,
  LeadCandidateAssessment,
  LeadDevelopmentHandoff,
} from "./types";

const HANDOFF_BUDGET_BYTES = 4_096;

function text(value: string, maximum = 220): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= maximum ? cleaned : `${cleaned.slice(0, maximum - 1).trimEnd()}…`;
}

function unique(values: string[], maximum: number): string[] {
  return [...new Set(values.map((value) => text(value, 180)).filter(Boolean))].slice(0, maximum);
}

function evidenceSnapshotHash(candidate: CorrectedLeadWorkflowCandidate): string {
  const snapshot = candidate.evidence.map((item) => ({ id: item.id, url: item.url,
    sourceType: item.sourceType, excerpt: item.excerpt })).sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function compactToBudget(handoff: LeadDevelopmentHandoff): LeadDevelopmentHandoff {
  const copy = structuredClone(handoff);
  const size = () => Buffer.byteLength(JSON.stringify(copy), "utf8");
  while (size() > HANDOFF_BUDGET_BYTES && copy.unknowns.length > 2) copy.unknowns.pop();
  while (size() > HANDOFF_BUDGET_BYTES && copy.risks.length > 2) copy.risks.pop();
  while (size() > HANDOFF_BUDGET_BYTES && copy.internalInterpretations.length > 1) copy.internalInterpretations.pop();
  while (size() > HANDOFF_BUDGET_BYTES && copy.personalizationHooks.length > 1) copy.personalizationHooks.pop();
  while (size() > HANDOFF_BUDGET_BYTES && copy.doNotClaim.length > 2) copy.doNotClaim.pop();
  while (size() > HANDOFF_BUDGET_BYTES && copy.externallyUsableFacts.length > 3) copy.externallyUsableFacts.pop();
  const usedEvidence = new Set(copy.externallyUsableFacts.flatMap((fact) => fact.evidenceIds));
  copy.evidenceIndex = copy.evidenceIndex.filter((item) => usedEvidence.has(item.evidenceId));
  while (size() > HANDOFF_BUDGET_BYTES && copy.evidenceIndex.length > 1) copy.evidenceIndex.pop();
  if (size() > HANDOFF_BUDGET_BYTES) {
    copy.identity.companyName = text(copy.identity.companyName, 120);
    copy.identity.officialUrl = text(copy.identity.officialUrl, 240);
    copy.identity.domain = text(copy.identity.domain, 120);
    copy.externallyUsableFacts = copy.externallyUsableFacts.slice(0, 1).map((fact) => ({ ...fact,
      statement: text(fact.statement, 120), evidenceIds: fact.evidenceIds.slice(0, 1), sourceTypes: fact.sourceTypes.slice(0, 1) }));
    copy.internalInterpretations = [];
    copy.personalizationHooks = copy.personalizationHooks.slice(0, 1).map((hook) => ({ ...hook,
      hook: text(hook.hook, 120), basedOnFactIds: hook.basedOnFactIds.slice(0, 1) }));
    copy.unknowns = copy.unknowns.slice(0, 1).map((item) => text(item, 120));
    copy.risks = copy.risks.slice(0, 1).map((item) => text(item, 120));
    copy.doNotClaim = copy.doNotClaim.slice(0, 1).map((item) => text(item, 120));
    copy.evidenceIndex = copy.evidenceIndex.slice(0, 1).map((item) => ({ ...item,
      url: text(item.url, 240), title: text(item.title, 80) }));
    copy.quality.conflicts = copy.quality.conflicts.slice(0, 1).map((item) => text(item, 120));
    copy.quality.warnings = ["Handoff was compacted to the transport budget."];
  }
  if (size() > HANDOFF_BUDGET_BYTES) throw new Error("Lead handoff exceeds the 4 KB transport budget after compaction");
  return copy;
}

export class LeadHandoffAssembler {
  assembleOne(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
    review: LeadAssessmentReview, runId: string): LeadDevelopmentHandoff {
    const evidenceById = new Map(candidate.evidence.map((item) => [item.id, item]));
    const priority: Record<string, number> = {
      "commercial-action": 0, "cooperation-path": 1, "brand-relationship": 2,
      "product-family": 3, role: 4, "active-networking": 5, identity: 6, "country-presence": 7,
    };
    const supported = candidate.correction.findings.filter((finding) => finding.status === "supported"
      && finding.confidence >= 70 && finding.evidenceIds.some((id) => evidenceById.get(id)?.sourceType !== "discovery"))
      .sort((left, right) => (priority[left.kind] ?? 20) - (priority[right.kind] ?? 20)
        || right.confidence - left.confidence);
    const externallyUsableFacts = supported.slice(0, 5).map((finding) => ({
      factId: finding.findingId,
      kind: finding.kind,
      statement: text(finding.statement),
      evidenceIds: finding.evidenceIds.filter((id) => evidenceById.get(id)?.sourceType !== "discovery").slice(0, 3),
      sourceTypes: finding.sourceTypes.filter((sourceType) => sourceType !== "discovery"),
      confidence: finding.confidence,
    }));
    const factIds = new Set(externallyUsableFacts.map((fact) => fact.factId));
    const internalInterpretations = assessment.dimensionRationales.flatMap((rationale) => {
      const basedOnFactIds = rationale.findingIds.filter((id) => factIds.has(id));
      return basedOnFactIds.length === 0 ? [] : [{
        interpretationId: `interpretation-${rationale.dimension}`,
        dimension: rationale.dimension,
        statement: text(rationale.reason),
        basedOnFactIds,
        confidence: rationale.confidence,
      }];
    }).slice(0, 3);
    const hookFacts = externallyUsableFacts.filter((fact) => ["commercial-action", "cooperation-path",
      "brand-relationship", "product-family", "role", "active-networking"].includes(fact.kind)).slice(0, 2);
    const personalizationHooks = hookFacts.map((fact) => ({
      hook: fact.statement,
      basedOnFactIds: [fact.factId],
      allowedInEmail: fact.confidence >= 80 && fact.sourceTypes.includes("official-website"),
    }));
    const conflicts = candidate.correction.findings.filter((finding) => finding.status === "conflicting")
      .map((finding) => text(finding.statement, 180));
    const doNotClaim = unique(candidate.correction.findings.filter((finding) => finding.status !== "supported")
      .map((finding) => finding.statement), 4);
    const evidenceIds = [...new Set(externallyUsableFacts.flatMap((fact) => fact.evidenceIds))].slice(0, 6);
    const readyForStrategy = assessment.scoringStatus === "completed" && externallyUsableFacts.length > 0
      && review.status !== "targeted-research-required";
    const readyForEmail = readyForStrategy && assessment.eligible && conflicts.length === 0
      && personalizationHooks.some((hook) => hook.allowedInEmail)
      && review.status !== "review-failed";
    const handoff: LeadDevelopmentHandoff = {
      version: "lead-handoff-v1",
      provenance: {
        candidateId: candidate.candidateId,
        runId,
        evidenceSnapshotHash: evidenceSnapshotHash(candidate),
        correctionModel: candidate.correction.model,
        scoringModel: assessment.model,
        reviewStatus: review.status,
      },
      identity: { companyName: text(candidate.companyName, 200), officialUrl: text(candidate.officialWebsiteUrl, 500),
        domain: text(candidate.domain, 200), possibleRoles: assessment.roles },
      decision: { score: assessment.totalScore, primaryFamily: candidate.correction.primaryFamily,
        recommendedFamilies: candidate.correction.resolvedFamilies,
        scoreConfidence: assessment.confidence, scoringStatus: assessment.scoringStatus },
      externallyUsableFacts,
      internalInterpretations,
      personalizationHooks,
      unknowns: unique(assessment.unknowns, 4),
      risks: unique(assessment.risks, 3),
      doNotClaim,
      evidenceIndex: evidenceIds.flatMap((id) => {
        const item = evidenceById.get(id);
        return item ? [{ evidenceId: id, url: item.url, title: text(item.title, 120), sourceType: item.sourceType }] : [];
      }),
      quality: {
        readyForStrategy,
        readyForEmail,
        conflicts: unique(conflicts, 3),
        warnings: unique([
          ...candidate.correction.warnings,
          ...assessment.warnings,
          ...review.warnings,
          ...(!readyForEmail ? ["Email generation must avoid unsupported candidate-specific claims."] : []),
        ], 4),
      },
    };
    return compactToBudget(handoff);
  }

  assemble(candidates: CorrectedLeadWorkflowCandidate[], assessments: LeadCandidateAssessment[],
    reviews: LeadAssessmentReview[], runId: string): LeadDevelopmentHandoff[] {
    const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    const reviewById = new Map(reviews.map((review) => [review.candidateId, review]));
    return assessments.flatMap((assessment) => {
      const candidate = candidateById.get(assessment.candidateId);
      const review = reviewById.get(assessment.candidateId);
      return candidate && review ? [this.assembleOne(candidate, assessment, review, runId)] : [];
    });
  }
}
