import nextEnv from "@next/env";
import { executeProvider, type ProviderId } from "../lib/benchmark";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const provider = process.argv[2] as ProviderId | undefined;
if (!provider || !["openai", "claude", "kimi", "deepseek", "grok"].includes(provider)) throw new Error("Usage: npm run benchmark:pilot -- <openai|claude|kimi|deepseek|grok>");
const artifact = await executeProvider(provider);
console.log(JSON.stringify({ providerId: artifact.providerId, modelId: artifact.modelId, searchRequestsObserved: artifact.searchRequestsObserved, outputSaved: true }, null, 2));
