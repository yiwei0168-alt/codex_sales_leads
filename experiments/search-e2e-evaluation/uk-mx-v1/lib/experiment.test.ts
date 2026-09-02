import { describe, expect, it } from "vitest";

import { intentRolesStayWithinCategory } from "./experiment";

describe("formal experiment intent normalization", () => {
  it("accepts one or all roles inside a frozen category", () => {
    expect(intentRolesStayWithinCategory(["Distributor"], ["Distributor", "VAD"])).toBe(true);
    expect(intentRolesStayWithinCategory(["Distributor", "VAD"], ["Distributor", "VAD"])).toBe(true);
  });

  it("rejects empty or out-of-category role output", () => {
    expect(intentRolesStayWithinCategory([], ["Distributor", "VAD"])).toBe(false);
    expect(intentRolesStayWithinCategory(["Distributor", "Retailer"], ["Distributor", "VAD"])).toBe(false);
  });
});
