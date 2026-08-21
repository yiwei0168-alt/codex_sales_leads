import { describe, expect, it } from "vitest";

import {
  formatProductComparatorAnswer,
  type ProductComparatorCandidate,
} from "../../../experiments/global-model-lead-benchmark/lib/product-comparator";

const candidate: ProductComparatorCandidate = {
  companyName: "Beispiel Netzwerk GmbH",
  domain: "beispiel.de",
  role: "Distributor",
  benchmarkCategory: "tier1_distributor",
  providerScore: 0.82,
  discoveryQuery: "networking distributor Germany official company",
  discoveryEvidence: { title: "Beispiel Netzwerk", url: "https://beispiel.de/", content: "Distributor für Netzwerktechnik", score: 0.82 },
  additionalEvidence: [],
  enrichmentErrors: [],
};

describe("Sales Lead Copilot benchmark adapter", () => {
  it("returns a category-scoped natural-language table without contact collection", () => {
    const answer = formatProductComparatorAnswer("Germany", [candidate], {
      searchQueries: 5, extractionRequests: 1, externalRequests: 6, searchCredits: 6, extractCredits: 1,
      totalCredits: 7, estimatedCostUsdPayAsYouGo: 0.056,
      costBasis: { usdPerCredit: 0.008, sourceUrl: "https://docs.tavily.com/documentation/api-credits", note: "test" },
      failedExternalRequests: 0,
    });
    expect(answer).toContain("## 一级分销商");
    expect(answer).toContain("| 1 | **Beispiel Netzwerk GmbH**");
    expect(answer).toContain("https://beispiel.de/");
    expect(answer).not.toContain("sales@beispiel.de");
    expect(answer).not.toContain("当前 Cudy 证据");
    expect(answer).not.toContain("已找到该公司域名下的 Cudy 页面");
    expect(answer).not.toContain("{\"");
  });
});
