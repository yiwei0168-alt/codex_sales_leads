import { isCurrentLeadScoringEvidence } from "../evidence-snapshot";
import type { CorrectedLeadWorkflowCandidate, LeadEvidenceItem } from "./types";

interface EvidencePacketOptions {
  requiredEvidenceIds: Iterable<string>;
  maxUnlinkedItems: number;
  maxExcerptCharacters: number;
  relevanceText?: string;
}

export interface ModelEvidenceItem {
  evidenceId: string;
  sourceType: LeadEvidenceItem["sourceType"];
  url: string;
  title: string;
  excerpt: string;
  capturedAt: string;
  contentHash?: string;
  freshnessStatus?: LeadEvidenceItem["freshnessStatus"];
  evidenceRunId?: string;
}

const BASE_TERMS = [
  "router", "wi-fi", "wifi", "wireless", "access point", "switch", "switching", "poe", "ethernet",
  "xpon", "ont", "fwa", "4g", "5g", "network", "distributor", "wholesale", "reseller", "dealer",
  "system house", "systemhaus", "integrator", "installer", "msp", "isp", "partner", "procurement",
  "customer", "employee", "revenue", "logistics", "inventory", "training", "support", "marketplace",
];

function relevanceTerms(text: string): string[] {
  const dynamic = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+./-]{4,}/gu) ?? [];
  return [...new Set([...BASE_TERMS, ...dynamic])].slice(0, 80);
}

function compactExcerpt(excerpt: string, maxCharacters: number, terms: readonly string[]): string {
  const normalized = excerpt.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) return normalized;
  const chunks: string[] = [normalized.slice(0, Math.min(500, Math.floor(maxCharacters * 0.35)))];
  const lower = normalized.toLowerCase();
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index < 0) continue;
    const start = Math.max(0, index - 180);
    const end = Math.min(normalized.length, index + term.length + 420);
    const chunk = normalized.slice(start, end);
    if (!chunks.some((existing) => existing.includes(chunk) || chunk.includes(existing))) chunks.push(chunk);
    if (chunks.join(" … ").length >= maxCharacters - 220) break;
  }
  if (chunks.join(" … ").length < maxCharacters - 220) chunks.push(normalized.slice(-220));
  return chunks.join(" … ").slice(0, maxCharacters);
}

function evidenceScore(item: LeadEvidenceItem, terms: readonly string[]): number {
  const text = `${item.title} ${item.excerpt}`.toLowerCase();
  const sourceScore = item.sourceType === "official-website" ? 30
    : item.sourceType === "independent-public" ? 20 : 0;
  return sourceScore + terms.reduce((score, term) => score + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

export function buildModelEvidencePacket(candidate: CorrectedLeadWorkflowCandidate,
  options: EvidencePacketOptions): ModelEvidenceItem[] {
  const required = new Set(options.requiredEvidenceIds);
  const current = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId));
  const terms = relevanceTerms(`${candidate.companyName} ${candidate.correction.resolvedRoles.join(" ")} ${options.relevanceText ?? ""}`);
  const requiredItems = current.filter((item) => required.has(item.id));
  const requiredHashes = new Set(requiredItems.map((item) => item.contentHash).filter(Boolean));
  const extras = current.filter((item) => !required.has(item.id) && (!item.contentHash || !requiredHashes.has(item.contentHash)))
    .sort((left, right) => evidenceScore(right, terms) - evidenceScore(left, terms)
      || left.url.localeCompare(right.url));
  const selected = [...requiredItems, ...extras.slice(0, Math.max(0, options.maxUnlinkedItems))];
  return selected.map((item) => ({
    evidenceId: item.id,
    sourceType: item.sourceType,
    url: item.url,
    title: item.title,
    excerpt: compactExcerpt(item.excerpt, options.maxExcerptCharacters, terms),
    capturedAt: item.capturedAt,
    contentHash: item.contentHash,
    freshnessStatus: item.freshnessStatus,
    evidenceRunId: item.evidenceRunId,
  }));
}
