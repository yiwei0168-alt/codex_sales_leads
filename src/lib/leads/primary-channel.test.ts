import { describe, expect, it } from "vitest";

import { selectPrimaryChannel } from "./primary-channel";

describe("selectPrimaryChannel", () => {
  it("keeps all supported families and accepts the agent-selected evidence-supported role", () => {
    const result = selectPrimaryChannel({ roles: ["Distributor", "Reseller", "E-tailer"],
      agentPrimaryRole: "Reseller" });
    expect(result.supportedFamilies).toEqual(["distribution", "resale", "retail"]);
    expect(result.primaryRole).toBe("Reseller");
    expect(result.primaryFamily).toBe("resale");
    expect(result.primaryChannel).toBe("b2b-resale");
    expect(result.usedSmallLongTailException).toBe(false);
  });

  it("does not apply an upward default to a mixed-role company", () => {
    const result = selectPrimaryChannel({ roles: ["Distributor", "VAR", "Reseller", "Installer"],
      agentPrimaryRole: "Installer" });
    expect(result.supportedFamilies).toEqual(["distribution", "resale", "services"]);
    expect(result.primaryRole).toBe("Installer");
    expect(result.primaryFamily).toBe("services");
    expect(result.primaryChannel).toBe("project-services");
    expect(result.usedSmallLongTailException).toBe(false);
  });

  it("retains Hybrid without forcing a display route", () => {
    const result = selectPrimaryChannel({ roles: ["Distributor", "SI"], agentPrimaryRole: "Hybrid" });
    expect(result.primaryRole).toBe("Hybrid");
    expect(result.primaryChannel).toBeNull();
  });

  it("returns no display route without an evidence-supported role", () => {
    expect(selectPrimaryChannel({ roles: [], agentPrimaryRole: "Unresolved" }).primaryChannel).toBeNull();
  });
});
