import { describe, expect, it } from "vitest";

import { blindAuditRoleFamily } from "./blind-audit-v2";

describe("Colombia blind-audit role-family normalization", () => {
  it.each([
    ["distribution", "distribution"], ["Distributor", "distribution"], ["VAD", "distribution"],
    ["resale", "resale"], ["Reseller", "resale"], ["VAR", "resale"],
    ["retail", "retail"], ["Retailer", "retail"], ["E-tailer", "retail"],
    ["services", "services"], ["SI", "services"], ["MSP", "services"],
    ["isp", "isp"], ["agent", "agent"], ["brand", "brand"],
    ["Hybrid", "hybrid"], ["Unverified", "unresolved"],
  ])("maps %s to %s", (role, expected) => {
    expect(blindAuditRoleFamily(role)).toBe(expected);
  });
});
