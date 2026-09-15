import { describe, expect, it } from "vitest";

import { preparePublicReviewDisclosure } from "./public-review-disclosure";

describe("preparePublicReviewDisclosure", () => {
  it("keeps public business URLs while removing contact and credential-shaped data recursively", () => {
    const disclosure = preparePublicReviewDisclosure({
      url: "https://public.example/products/12345",
      capturedAt: "2026-09-15T08:30:00Z",
      title: "Contact sales@example.com or +49 30 12345678",
      evidence: [{ excerpt: "api_key=sk-live-example password:open-sesame" }],
    });

    expect(disclosure.value.url).toBe("https://public.example/products/12345");
    expect(disclosure.value.capturedAt).toBe("2026-09-15T08:30:00Z");
    expect(JSON.stringify(disclosure.value)).not.toContain("sales@example.com");
    expect(JSON.stringify(disclosure.value)).not.toContain("12345678");
    expect(JSON.stringify(disclosure.value)).not.toContain("sk-live-example");
    expect(JSON.stringify(disclosure.value)).not.toContain("open-sesame");
    expect(disclosure.redactionCounts).toMatchObject({ credential: 2, email: 1, phone: 1 });
  });

  it("does not mutate the local evidence object", () => {
    const local = { excerpt: "Write to owner@example.com" };
    const disclosure = preparePublicReviewDisclosure(local);

    expect(local.excerpt).toBe("Write to owner@example.com");
    expect(disclosure.value.excerpt).toBe("Write to [email removed]");
  });
});
