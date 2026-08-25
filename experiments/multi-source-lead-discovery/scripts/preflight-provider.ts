import { readFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import { DISCOVERY_PROVIDER_IDS, type DiscoveryProviderId } from "../lib/contracts";
import { createDiscoveryProvider } from "../lib/providers";

nextEnv.loadEnvConfig(process.cwd());

const providerId = process.argv[2] as DiscoveryProviderId | undefined;
if (!providerId || !DISCOVERY_PROVIDER_IDS.includes(providerId)) {
  throw new Error(`Usage: npm run benchmark:discovery:preflight -- ${DISCOVERY_PROVIDER_IDS.join("|")}`);
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const config = JSON.parse(await readFile(path.join(root, "config/benchmark.json"), "utf8")) as {
  countryCode: string; countryName: string; languageCode: string;
  preflight: { query: string; maxResults: number; timeoutMs: number };
};
const output = await createDiscoveryProvider(providerId, { timeoutMs: config.preflight.timeoutMs }).search({
  query: config.preflight.query,
  countryCode: config.countryCode,
  countryName: config.countryName,
  languageCode: config.languageCode,
  maxResults: config.preflight.maxResults,
});

console.log(JSON.stringify({
  providerId: output.providerId,
  resultCount: output.items.length,
  sourceCount: output.sourceUrls.length,
  requestCount: output.requestCount,
  latencyMs: output.latencyMs,
  usage: output.usage,
  sample: output.items.slice(0, 3),
}, null, 2));
