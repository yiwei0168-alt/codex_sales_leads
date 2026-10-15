import { describe, expect, it } from "vitest";
import { assertMa24EvaluationHardLimit, ma24SpendCapMicros } from "./ma24-g15-hard-limit-binding";
import type { Ma24G15Preview } from "./ma24-g15-runtime-binding";

const preview = () => ({ maximumProviderRequests: 2, maximumRequestBytes: 20,
  maximumOutputTokens: 10, hardSpendCapUsd: 0.0001,
  paidCallAuthorizationReference: "reviewed-synthetic-authorization" }) as Ma24G15Preview;
const row = () => ({ maximum_provider_requests: "2", maximum_request_bytes: "20",
  maximum_output_tokens: "10", hard_spend_cap_micros: "100",
  authorized_at: "2026-10-16T00:00:00Z",
  authorization_reference: "reviewed-synthetic-authorization" });

describe("MA24 frozen hard limit binding", () => {
  it("converts a reviewed USD ceiling to exact micro-USD", () => {
    expect(ma24SpendCapMicros(0.000001)).toBe(BigInt(1));
    expect(ma24SpendCapMicros(0.0001)).toBe(BigInt(100));
    for (const value of [0, -1, 0.0000001, 1e20, null])
      expect(() => ma24SpendCapMicros(value)).toThrow();
  });
  it("matches all four ceilings and the authorization reference", () => {
    expect(assertMa24EvaluationHardLimit(preview(), row())).toEqual(row());
    for (const key of ["maximum_provider_requests", "maximum_request_bytes",
      "maximum_output_tokens", "hard_spend_cap_micros"] as const) {
      expect(() => assertMa24EvaluationHardLimit(preview(), { ...row(), [key]: "99" }))
        .toThrow("differs from frozen preview");
    }
    expect(() => assertMa24EvaluationHardLimit(preview(), {
      ...row(), authorization_reference: "other" })).toThrow("differs from frozen preview");
    expect(() => assertMa24EvaluationHardLimit(preview(), undefined)).toThrow("missing");
  });
});
