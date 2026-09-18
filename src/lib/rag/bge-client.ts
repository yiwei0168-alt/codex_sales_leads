const BGE_DIMENSIONS = 1024;
const BGE_REVISION = "5617a9f61b028005a4858fdac845db406aefb181";

export function bgeServiceBaseUrl(): string {
  const configured = process.env.BGE_M3_SERVICE_URL?.trim() || "http://127.0.0.1:8765";
  const parsed = new URL(configured);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)
    || parsed.username || parsed.password || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new Error("BGE_M3_SERVICE_URL must be a loopback-only HTTP origin");
  }
  return parsed.origin;
}

export async function embedTextsWithBge(inputs: string[], transport: typeof fetch = fetch): Promise<number[][]> {
  if (!inputs.length) return [];
  if (inputs.length > 64 || inputs.some((input) => !input.trim())) throw new Error("BGE batch is invalid");
  const response = await transport(`${bgeServiceBaseUrl()}/embed`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputs }), signal: AbortSignal.timeout(30_000),
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
