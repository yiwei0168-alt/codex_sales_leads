import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const apiKey = process.env.CLAUDE_API_KEY;
const configuredBaseUrl = process.env.CLAUDE_BASE_URL;
if (!apiKey || !configuredBaseUrl) throw new Error("Missing Claude gateway configuration");
const baseUrl = configuredBaseUrl.replace(/\/+$/, "");
const url = /\/v1$/i.test(baseUrl) ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
const response = await fetch(url, {
  headers: { authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error(`Model discovery failed with HTTP ${response.status}`);
const body = await response.json();
const ids = (Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [])
  .map((item) => typeof item === "string" ? item : item?.id)
  .filter((id) => typeof id === "string" && /claude/i.test(id))
  .sort();
console.log(JSON.stringify({ modelCount: ids.length, modelIds: ids }, null, 2));
