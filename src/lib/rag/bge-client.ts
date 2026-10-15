const BGE_DIMENSIONS = 1024;
const BGE_REVISION = "5617a9f61b028005a4858fdac845db406aefb181";
const BGE_MODEL = "BAAI/bge-m3";

export function bgeServiceBaseUrl(): string {
  const configured = process.env.BGE_M3_SERVICE_URL?.trim() || "http://127.0.0.1:8765";
  const parsed = new URL(configured);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)
    || parsed.username || parsed.password || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new Error("BGE_M3_SERVICE_URL must be a loopback-only HTTP origin");
  }
  return parsed.origin;
}

/** Check the loaded local model immediately before an evaluation uses its retrieval lane. */
export async function assertBgeServiceReady(transport: typeof fetch = fetch): Promise<void> {
  const response = await transport(`${bgeServiceBaseUrl()}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`BGE-M3 health HTTP ${response.status}`);
  const body = await response.json() as { status?: string; model?: string;
    revision?: string; dimensions?: number };
  if (body.status !== "ready" || body.model !== BGE_MODEL ||
    body.revision !== BGE_REVISION || body.dimensions !== BGE_DIMENSIONS)
    throw new Error("BGE-M3 evaluation baseline unavailable or incompatible");
}

export async function embedTextsWithBge(
  inputs: string[],
  transport: typeof fetch = fetch,
  timeoutMs = 30_000,
): Promise<number[][]> {
  if (!inputs.length) return [];
  if (inputs.length > 64 || inputs.some((input) => !input.trim())) throw new Error("BGE batch is invalid");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) throw new Error("BGE timeout is invalid");
  const response = await transport(`${bgeServiceBaseUrl()}/embed`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputs }), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`BGE-M3 service HTTP ${response.status}`);
  const body = await response.json() as { revision?: string; dimensions?: number; embeddings?: number[][] };
  if (body.revision !== BGE_REVISION || body.dimensions !== BGE_DIMENSIONS
    || body.embeddings?.length !== inputs.length
    || body.embeddings.some((vector) => vector.length !== BGE_DIMENSIONS || vector.some((value) => !Number.isFinite(value)))) {
    throw new Error("BGE-M3 service returned an incompatible profile or vector batch");
  }
  return body.embeddings;
}
