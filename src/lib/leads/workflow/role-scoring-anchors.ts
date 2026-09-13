import { ACTIVE_LEAD_SCORING_POLICY } from "../scoring-policy";
import { correctionCompletion } from "./correction-completion";
import type { LeadCandidateCorrection } from "./types";

// Evidence examples, never automatic point awards or additional eligibility gates.
const subtypeEvidence: Record<string, string> = {
  Distributor: "Downstream dealer reach, stocking, procurement and logistics; do not require project delivery.",
  VAD: "Downstream partner reach plus documented pre-sales, training or solution enablement; distinguish value-added distribution from direct integration.",
  VAR: "Resale combined with a documented customer solution, configuration or integration; do not require a wholesale dealer network.",
  Dealer: "Local authorized sales, customer access, product ordering and support; territory breadth alone is not a gate.",
  Reseller: "Networking offers, ordering or quotation, business customer access and fulfilment; do not require SI design or MSP recurring contracts.",
  SI: "Named networking projects, design, specification, integration and acceptance delivery; equipment selection can establish influence without stocking or wholesale reach.",
  Installer: "On-site networking installation, commissioning and customer handover; do not infer procurement control from installation alone.",
  MSP: "Recurring managed networking service, managed customer sites, monitoring, support and lifecycle responsibility; do not infer hardware purchasing from service delivery alone.",
  Retailer: "Relevant in-store networking assortment, consumer reach, merchandising, fulfilment and returns; no B2B dealer-network requirement.",
  "E-tailer": "Relevant online networking listings, category reach, ordering, fulfilment and returns; no physical-store requirement.",
  ISP: "Access subscribers, deployment footprint, CPE selection, provisioning and network operations; no resale dealer-network requirement.",
  Agent: "Represented principals, territory access, introductions and commission-sales activity; do not infer inventory ownership or purchasing control.",
  "Brand Owner": "Owned networking portfolio, product operations and evidenced partnership entry space; own-brand activity alone neither proves OEM demand nor a hard blocker.",
};

export function roleScoringAnchors(correction: LeadCandidateCorrection) {
  if (correctionCompletion(correction) !== "completed"
    || correction.primaryRole === "Hybrid" || correction.primaryRole === "Unresolved") return null;
  const card = Object.entries(ACTIVE_LEAD_SCORING_POLICY.roleScorecards)
    .find(([, value]) => value.roles.includes(correction.primaryRole));
  const observableSubtypeEvidence = subtypeEvidence[correction.primaryRole];
  if (!card || !observableSubtypeEvidence) return null;
  return {
    primaryFamily: correction.primaryFamily,
    primarySubtype: correction.primaryRole,
    scorecardKey: card[0],
    observableSubtypeEvidence,
  };
}
