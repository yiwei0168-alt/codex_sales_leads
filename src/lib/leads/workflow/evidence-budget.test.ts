import { describe, expect, it } from "vitest";

import { estimateEvidenceTokens, evidenceBudgetFor, preliminaryResearchDepth, secondCitationEligible } from "./evidence-budget";
import { initialPdfDecision, nextPdfExtractionMethod, pdfWorthinessScore } from "./pdf-extraction-policy";

describe("evidence budgets", () => {
  it("uses the confirmed per-depth token budgets", () => {
    expect(evidenceBudgetFor("limited")).toMatchObject({ initialTokens: 1500, maximumRounds: 1, maximumTotalTokens: 2250 });
    expect(evidenceBudgetFor("deep")).toMatchObject({ initialTokens: 4000, maximumRounds: 2, maximumTotalTokens: 8000 });
  });

  it("requires eight expected score points or a critical state change for a second citation", () => {
    expect(secondCitationEligible({ expectedTotalScoreChange: 7 })).toBe(false);
    expect(secondCitationEligible({ expectedTotalScoreChange: 8 })).toBe(true);
    expect(secondCitationEligible({ expectedTotalScoreChange: 0, criticalStateChanges: ["primary-role"] })).toBe(true);
    expect(secondCitationEligible({ expectedTotalScoreChange: 20, confidenceOnly: true })).toBe(false);
  });

  it("never classifies sparse evidence alone as limited research", () => {
    expect(preliminaryResearchDepth({ targetedSearchFailed: true })).toBe("standard");
    expect(preliminaryResearchDepth({ positiveScaleClass: "Local/Small", targetedSearchFailed: true })).toBe("limited");
    expect(preliminaryResearchDepth({ userNominated: true })).toBe("deep");
  });

  it("estimates multilingual token pressure conservatively", () => {
    expect(estimateEvidenceTokens("网络设备")).toBe(4);
    expect(estimateEvidenceTokens("network equipment")).toBeGreaterThanOrEqual(4);
  });
});

describe("progressive PDF extraction", () => {
  const valuable = { evidenceGapRelevance: 90, sourceAuthority: 100, expectedNovelty: 80,
    candidateStrategicValue: 80, freshnessAndMarketFit: 90 };

  it("gates extraction before spending the parsing budget", () => {
    expect(pdfWorthinessScore(valuable)).toBeGreaterThanOrEqual(60);
    expect(initialPdfDecision(valuable)).toBe("extract");
    expect(initialPdfDecision({ evidenceGapRelevance: 50, sourceAuthority: 50, expectedNovelty: 40,
      candidateStrategicValue: 40, freshnessAndMarketFit: 40 })).toBe("sample");
    expect(initialPdfDecision({ evidenceGapRelevance: 10, sourceAuthority: 20, expectedNovelty: 10,
      candidateStrategicValue: 10, freshnessAndMarketFit: 10 })).toBe("skip");
  });

  it("upgrades only selected relevant pages with material expected impact", () => {
    expect(nextPdfExtractionMethod({ relevantContentFound: true, unresolvedEvidenceGap: true,
      expectedTotalScoreChange: 8 })).toBe("pypdf");
    expect(nextPdfExtractionMethod({ currentMethod: "pypdf", relevantContentFound: true,
      unresolvedEvidenceGap: true, tableOrMultiColumnPage: true, expectedTotalScoreChange: 8 })).toBe("pdfplumber");
    expect(nextPdfExtractionMethod({ currentMethod: "pdfplumber", relevantContentFound: true,
      unresolvedEvidenceGap: true, imageOnlyPage: true, expectedTotalScoreChange: 8 })).toBe("tesseract");
    expect(nextPdfExtractionMethod({ currentMethod: "tesseract", relevantContentFound: true,
      unresolvedEvidenceGap: true, expectedTotalScoreChange: 8 })).toBe("multimodal");
    expect(nextPdfExtractionMethod({ currentMethod: "pypdf", relevantContentFound: true,
      unresolvedEvidenceGap: true, tableOrMultiColumnPage: true, expectedTotalScoreChange: 2 })).toBeNull();
  });
});
