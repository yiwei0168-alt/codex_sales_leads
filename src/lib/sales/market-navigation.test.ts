import { describe, expect, it } from "vitest";
import { marketCode, marketHref, marketLabel } from "./market-navigation";

describe("country navigation", () => {
  it("puts multilingual names for the same market into one partition", () => {
    for (const name of ["CO", "co", "Colombia", "哥伦比亚", "Colombie"]) expect(marketCode(name)).toBe("CO");
    expect(marketCode("UK")).toBe("GB");
    expect(marketCode("Mexico")).toBe("MX");
  });
  it("keeps unknown and all-country partitions distinct", () => {
    expect(marketCode("")).toBe("unknown");
    expect(marketHref("all", "leads")).toBe("/markets/all/leads");
    expect(marketHref("哥伦比亚", "channel-map")).toBe("/markets/CO/channel-map");
    expect(marketLabel("CO")).toBe("哥伦比亚");
  });
});
