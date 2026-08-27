import { describe, expect, it } from "vitest";

import { assessLeadEvidenceQuality } from "./evidence-quality";

describe("claim-linked lead evidence quality", () => {
  it("accepts one concrete company-owned official source", () => {
    const result = assessLeadEvidenceQuality({
      candidateDomain: "example.de", officialUrl: "https://example.de/", evidence: [{
        url: "https://example.de/networking", sourceType: "official-website",
        excerpt: "Example GmbH sells routers, PoE switches and wireless access points to business customers.",
      }],
    });
    expect(result.sufficient).toBe(true);
  });

  it("rejects a search-provider summary as the only evidence", () => {
    const result = assessLeadEvidenceQuality({
      candidateDomain: "example.de", officialUrl: "https://example.de/", evidence: [{
        url: "https://example.de/", sourceType: "discovery",
        excerpt: "Search provider summary says this is a networking distributor in Germany.",
      }],
    });
    expect(result.sufficient).toBe(false);
    expect(result.discoveryOnlyCount).toBe(1);
  });

  it("fails when the claimed official URL does not match the evidence entity", () => {
    const result = assessLeadEvidenceQuality({
      officialUrl: "https://wrong.example/", evidence: [{
        url: "https://smarttechnik.eu/", excerpt: "Smarttechnik installs and supplies business Wi-Fi equipment.",
      }],
    });
    expect(result.identityConsistent).toBe(false);
    expect(result.sufficient).toBe(false);
  });

  it("counts mirrored excerpts and pages from one origin once", () => {
    const excerpt = "A concrete public profile documents router sales and WLAN installation services.";
    const result = assessLeadEvidenceQuality({
      evidence: [
        { url: "https://directory.example/company", excerpt, sourceType: "independent-public" },
        { url: "https://mirror.example/company", excerpt, sourceType: "independent-public" },
        { url: "https://directory.example/about", excerpt: `${excerpt} More details.`, sourceType: "independent-public" },
      ],
    });
    expect(result.duplicateCount).toBe(1);
    expect(result.independentOriginCount).toBe(1);
    expect(result.sufficient).toBe(false);
  });

  it("allows a deterministically supported small long-tail company to pass with one concrete public profile", () => {
    const result = assessLeadEvidenceQuality({
      officialUrl: "https://www.linkedin.com/company/local-wifi-installer/",
      evidence: [{
        url: "https://www.linkedin.com/company/local-wifi-installer/", sourceType: "official-platform-profile",
        excerpt: "Owner-operated local Wi-Fi Installer has 6 employees and installs WLAN access points for shops and small offices.",
      }],
    });
    expect(result.sufficient).toBe(true);
    expect(result.reason).toContain("long-tail");
    expect(result.profile).toBe("confirmed-small-long-tail");
  });

  it("does not apply the single independent-source exception to a standard profile", () => {
    const result = assessLeadEvidenceQuality({
      evidence: [{
        url: "https://industry.example/company", sourceType: "independent-public",
        excerpt: "The company distributes active networking products through local channel partners.",
      }],
    });
    expect(result.sufficient).toBe(false);
  });

  it("does not mistake a Google search-result URL for a long-tail business profile", () => {
    const result = assessLeadEvidenceQuality({
      officialUrl: "https://www.google.com/search?q=local+installer",
      evidence: [{
        url: "https://www.google.com/search?q=local+installer", sourceType: "independent-public",
        excerpt: "Search results mention a local installer that may provide business Wi-Fi services.",
      }],
    });
    expect(result.sufficient).toBe(false);
    expect(result.discoveryOnlyCount).toBe(1);
  });
});
