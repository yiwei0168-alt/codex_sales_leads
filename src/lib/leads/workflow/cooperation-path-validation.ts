import { isCurrentLeadScoringEvidence } from "../evidence-snapshot";
import type { LeadAssessmentModelOutput } from "./schemas";
import type { CorrectedLeadWorkflowCandidate } from "./types";

type Path = LeadAssessmentModelOutput["cooperationPaths"][number];
export function cooperationPathRoleCompatible(path: Path): boolean {
  const tier1 = path.candidateRole === "Distributor" || path.candidateRole === "VAD";
  if (path.pathType === "Direct Tier-1 Supply") return tier1;
  if (["Distributor-Mediated Supply", "Direct Downstream Channel Supply"].includes(path.pathType)) return !tier1;
  return true;
}

/** Validation explains rejection; it never changes a model's role or path type. */
export function cooperationPathRejections(paths: readonly Path[], candidate: CorrectedLeadWorkflowCandidate,
  allowOemOdm: boolean) {
  const evidence = new Set(candidate.evidence.filter(item =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId)).map(item => item.id));
  return paths.flatMap(path => {
    const reasons: string[] = [];
    if (!candidate.correction.resolvedRoles.includes(path.candidateRole)) reasons.push("unsupported-role");
    if (!cooperationPathRoleCompatible(path)) reasons.push("role-path-incompatible");
    if (!allowOemOdm && path.pathType === "OEM/ODM") reasons.push("oem-odm-disabled");
    if (!path.evidenceIds.some(id => evidence.has(id))) reasons.push("missing-current-evidence");
    return reasons.length ? [{ pathId: path.pathId, reasons }] : [];
  });
}

export const COOPERATION_PATH_ROLE_INSTRUCTION = "Use only the supplied resolvedRoles. Direct Tier-1 Supply requires Distributor or VAD. VAR, Dealer, Reseller, Retailer, E-tailer, SI, MSP, Installer and ISP must not use Direct Tier-1 Supply; assess Distributor-Mediated Supply, Direct Downstream Channel Supply or another evidence-supported enabled path instead. These are compatibility constraints, not instructions to manufacture a path. Return no path if evidence cannot support one.";
