import { describe, expect, it } from "vitest";

import { assessProductUseCaseFit } from "./v1.3-rescoring";

describe("v1.3 product/use-case fit", () => {
  it("awards level five to an active Cudy listing", () => {
    expect(assessProductUseCaseFit(["Cudy WR3000 is in stock and available to order."]).level).toBe(5);
  });

  it("keeps enterprise-adjacent active networking below direct product overlap", () => {
    expect(assessProductUseCaseFit(["We operate data center network firewalls for large enterprise customers."]).level).toBe(2);
  });

  it("does not treat generic IT consulting as product fit", () => {
    expect(assessProductUseCaseFit(["Cloud transformation and managed IT consulting."]).level).toBe(0);
  });

  it("recognizes a hospitality guest-Wi-Fi specialist as a direct Cudy use case", () => {
    expect(assessProductUseCaseFit(["We plan, install and maintain guest Wi-Fi for hotels and restaurants."]).level).toBe(5);
  });

  it("keeps a high-end networking VAD at moderate product fit", () => {
    expect(assessProductUseCaseFit(["Value Added Distributor for data center networking, campus switches, WLAN and firewalls."]).level).toBe(3);
  });

  it("does not award level five for comparable-brand listings without a partner path", () => {
    expect(assessProductUseCaseFit(["Online shop listing Ubiquiti routers, access points and managed switches."]).level).toBe(4);
  });

  it("awards level five for comparable-brand distribution plus broad product overlap", () => {
    expect(assessProductUseCaseFit(["Ruijie distribution partner for routers, access points and managed switches."]).level).toBe(5);
  });
});
