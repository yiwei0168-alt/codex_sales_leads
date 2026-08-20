import nextEnv from "@next/env";

import { executeProductComparator } from "../lib/product-comparator";

nextEnv.loadEnvConfig(process.cwd());

const repetition = Number(process.argv[2]);
if (!Number.isInteger(repetition)) throw new Error("Usage: npm run benchmark:product -- <repetition>");

const result = await executeProductComparator(repetition);
console.log(JSON.stringify({
  providerId: result.providerId,
  repetition: result.repetition,
  countryCode: result.countryCode,
  candidates: result.rawProviderResponse.candidates.length,
  latencyMs: result.latencyMs,
  resourceUsage: result.resourceUsage,
}, null, 2));
