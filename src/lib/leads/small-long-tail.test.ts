import { describe, expect, it } from "vitest";

import { assessSmallLongTailProfile } from "./small-long-tail";

describe("small long-tail evidence profile", () => {
  it("confirms the profile from direct small-company evidence plus a platform footprint", () => {
    const result = assessSmallLongTailProfile([{
      url: "https://www.linkedin.com/company/local-wifi/", sourceType: "official-platform-profile",
      excerpt: "Local Wi-Fi is an owner-operated regional installer with 8 employees.",
    }]);
    expect(result.profile).toBe("confirmed-small-long-tail");
    expect(result.exceptionEligible).toBe(true);
    expect(result.directSizeSignals.map((item) => item.kind)).toContain("employees-1-49");
  });

  it("accepts two structural signals from one source without requiring two sources", () => {
    const result = assessSmallLongTailProfile([{
      url: "https://www.google.de/maps/place/example", sourceType: "official-platform-profile",
      excerpt: "An owner-operated local installer providing Wi-Fi deployment for shops in Bremen.",
    }]);
    expect(result.profile).toBe("probable-small-long-tail");
    expect(result.structuralSignals.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "owner-operated", "local-or-regional-scope", "official-platform-storefront",
    ]));
  });

  it("does not turn sparse information into small-company evidence", () => {
    const result = assessSmallLongTailProfile([{
      url: "https://directory.example/company", sourceType: "independent-public",
      excerpt: "A networking company. No employee, revenue, warehouse or brand information was found and its website has low traffic.",
    }]);
    expect(result.profile).toBe("standard");
    expect(result.exceptionEligible).toBe(false);
  });

  it("uses explicit large-company evidence as an override", () => {
    const result = assessSmallLongTailProfile([{
      url: "https://www.linkedin.com/company/large-network/", sourceType: "official-platform-profile",
      excerpt: "An owner-operated regional technology group with 900 employees.",
    }]);
    expect(result.profile).toBe("standard");
    expect(result.largeCompanyOverrides.map((item) => item.kind)).toContain("employees-250-plus");
  });

  it("ignores provider summaries when classifying the profile", () => {
    const result = assessSmallLongTailProfile([{
      url: "https://search.example/result", sourceType: "provider-summary",
      excerpt: "Owner-operated local installer with 5 employees.",
    }]);
    expect(result.profile).toBe("standard");
  });

  it("does not mistake a Google search URL for a platform business profile", () => {
    const result = assessSmallLongTailProfile([{
      url: "https://www.google.com/search?q=local+installer", sourceType: "independent-public",
      excerpt: "Owner-operated local installer with 5 employees.",
    }]);
    expect(result.profile).toBe("standard");
    expect(result.structuralSignals).toHaveLength(0);
  });
});
