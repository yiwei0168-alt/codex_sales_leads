import { afterEach, describe, expect, it, vi } from "vitest";
import { kimiGatewayConfigured, kimiOpenRouterModel } from "./kimi-openrouter";
import { isKimiK3, kimiOutputLimit } from "./kimi-contract";

afterEach(() => vi.unstubAllEnvs());
describe("Kimi gateway contract", () => {
  it("preserves native and qualified model choices and K3 limits", () => {
    expect(kimiOpenRouterModel("kimi-k3")).toBe("moonshotai/kimi-k3");
    expect(kimiOpenRouterModel("moonshotai/kimi-k2.6")).toBe("moonshotai/kimi-k2.6");
    expect(isKimiK3("moonshotai/kimi-k3")).toBe(true);
    expect(kimiOutputLimit("moonshotai/kimi-k3", 8000)).toEqual({ max_completion_tokens: 8000 });
    expect(kimiOutputLimit("moonshotai/kimi-k2.6", 4000)).toEqual({ max_tokens: 4000 });
    expect(() => kimiOpenRouterModel("other/kimi-k3")).toThrow("model ID");
  });
  it("reports readiness from the gateway, without a legacy credential", () => {
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "gateway-test");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("KIMI_MODEL", "kimi-k3");
    expect(kimiGatewayConfigured()).toBe(true);
    vi.stubEnv("OPENROUTER_BASE_URL", "https://untrusted.example/api/v1");
    expect(kimiGatewayConfigured()).toBe(false);
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(kimiGatewayConfigured()).toBe(false);
  });
});
