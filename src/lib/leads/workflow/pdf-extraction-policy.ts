import type { CriticalDecisionState } from "./evidence-budget";
import { secondCitationEligible } from "./evidence-budget";

export type PdfExtractionMethod = "pypdf" | "pdfplumber" | "tesseract" | "multimodal";
export type PdfInitialDecision = "skip" | "sample" | "extract";

export interface PdfWorthinessSignals {
  evidenceGapRelevance: number;
  sourceAuthority: number;
  expectedNovelty: number;
  candidateStrategicValue: number;
  freshnessAndMarketFit: number;
}

const bounded = (value: number) => Math.max(0, Math.min(100, value));

export function pdfWorthinessScore(signals: PdfWorthinessSignals): number {
  return Math.round(
    bounded(signals.evidenceGapRelevance) * 0.35
    + bounded(signals.sourceAuthority) * 0.2
    + bounded(signals.expectedNovelty) * 0.2
    + bounded(signals.candidateStrategicValue) * 0.15
    + bounded(signals.freshnessAndMarketFit) * 0.1,
  );
}

export function initialPdfDecision(signals: PdfWorthinessSignals): PdfInitialDecision {
  const score = pdfWorthinessScore(signals);
  if (score >= 60) return "extract";
  if (score >= 45) return "sample";
  return "skip";
}

export function nextPdfExtractionMethod(input: {
  currentMethod?: PdfExtractionMethod;
  relevantContentFound: boolean;
  unresolvedEvidenceGap: boolean;
  tableOrMultiColumnPage?: boolean;
  imageOnlyPage?: boolean;
  expectedTotalScoreChange: number;
  criticalStateChanges?: CriticalDecisionState[];
}): PdfExtractionMethod | null {
  if (!input.relevantContentFound || !input.unresolvedEvidenceGap) return null;
  if (!secondCitationEligible({
    expectedTotalScoreChange: input.expectedTotalScoreChange,
    criticalStateChanges: input.criticalStateChanges,
  })) return null;
  if (!input.currentMethod) return "pypdf";
  if (input.currentMethod === "pypdf" && input.tableOrMultiColumnPage) return "pdfplumber";
  if ((input.currentMethod === "pypdf" || input.currentMethod === "pdfplumber") && input.imageOnlyPage) return "tesseract";
  if (input.currentMethod === "tesseract") return "multimodal";
  return null;
}
