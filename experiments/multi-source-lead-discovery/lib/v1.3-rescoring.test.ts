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
});
