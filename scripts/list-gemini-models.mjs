import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const apiKey = process.env.GEMINI_API_KEY;
const configuredBaseUrl = process.env.GEMINI_BASE_URL;
if (!apiKey || !configuredBaseUrl) throw new Error("Missing Gemini API configuration");
const configured = new URL(configuredBaseUrl);
const url = new URL("/v1beta/models?pageSize=1000", configured.origin);
const response = await fetch(url, {
  headers: { "x-goog-api-key": apiKey },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error(`Gemini model discovery failed with HTTP ${response.status}`);
const body = await response.json();
const models = (body.models ?? [])
  .filter((item) => /gemini/i.test(item.name ?? ""))
  .map((item) => ({
    id: String(item.name).replace(/^models\//, ""),
    displayName: item.displayName ?? null,
    methods: item.supportedGenerationMethods ?? [],
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
console.log(JSON.stringify({ modelCount: models.length, models }, null, 2));
