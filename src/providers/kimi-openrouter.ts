import { getOpenRouterConfig } from "./openrouter";

/** Preserve specialist model choices while routing exclusively through the gateway. */
export function kimiOpenRouterModel(value = process.env.KIMI_MODEL): string {
  const model = value?.trim() || "kimi-k3";
  const normalized = model.startsWith("moonshotai/") ? model : `moonshotai/${model}`;
  if (!/^moonshotai\/kimi-[a-z0-9.-]+$/i.test(normalized)) {
    throw new Error("Kimi requires a moonshotai/kimi-* OpenRouter model ID");
  }
  return normalized;
}

export function kimiGatewayConfigured(): boolean {
  try {
    getOpenRouterConfig();
    kimiOpenRouterModel();
    return true;
  } catch {
    return false;
  }
}
