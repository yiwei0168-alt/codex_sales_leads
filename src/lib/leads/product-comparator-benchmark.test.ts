import { describe, expect, it } from "vitest";

import {
  extractGermanPublicPhones,
  formatProductComparatorAnswer,
  type ProductComparatorCandidate,
} from "../../../experiments/global-model-lead-benchmark/lib/product-comparator";

const candidate: ProductComparatorCandidate = {
  companyName: "Beispiel Netzwerk GmbH",
  domain: "beispiel.de",
  role: "Distributor",
  providerScore: 0.82,
  discoveryQuery: "networking distributor Germany official company",
  discoveryEvidence: { title: "Beispiel Netzwerk", url: "https://beispiel.de/", content: "Distributor für Netzwerktechnik", score: 0.82 },
  cudyEvidence: [{ title: "Cudy Router", url: "https://beispiel.de/cudy", content: "Cudy Router", score: 0.9 }],
  namedContacts: [{ fullName: "Erika Muster", jobTitle: "Geschäftsführerin", sourceUrl: "https://linkedin.com/in/erika-muster" }],
  publicEmails: [{ value: "sales@beispiel.de", sourceUrl: "https://beispiel.de/kontakt" }],
  publicPhones: [{ value: "+49 30 12345678", sourceUrl: "https://beispiel.de/kontakt" }],
  additionalEvidence: [],
  enrichmentErrors: [],
};

describe("Sales Lead Copilot benchmark adapter", () => {
  it("extracts German public phone formats without collecting short numbers", () => {
    expect(extractGermanPublicPhones("Telefon +49 (0) 30 12345678; gegründet 2018; Fax 030/87654321"))
      .toEqual(["+49 (0) 30 12345678", "030/87654321"]);
  });

  it("returns a numbered natural-language table that retains public evidence", () => {
    const answer = formatProductComparatorAnswer("Germany", [candidate], {
      searchQueries: 5, extractionRequests: 1, externalRequests: 6, searchCredits: 6, extractCredits: 1,
      totalCredits: 7, estimatedCostUsdPayAsYouGo: 0.056,
      costBasis: { usdPerCredit: 0.008, sourceUrl: "https://docs.tavily.com/documentation/api-credits", note: "test" },
      failedExternalRequests: 0,
    });
    expect(answer).toContain("| 1 | **Beispiel Netzwerk GmbH**");
    expect(answer).toContain("sales@beispiel.de");
    expect(answer).not.toContain("https://beispiel.de/cudy");
    expect(answer).not.toContain("当前 Cudy 证据");
    expect(answer).not.toContain("已找到该公司域名下的 Cudy 页面");
    expect(answer).not.toContain("{\"");
  });
});
