import nextEnv from "@next/env";
import { executeProvider, type ProviderId } from "../lib/benchmark";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const provider = process.argv[2] as ProviderId | undefined;
const repetition = Number(process.argv[3] ?? "1");
const attempt = Number(process.argv[4] ?? "1");
if (!provider || !["openai", "claude", "kimi", "deepseek", "grok", "gemini"].includes(provider)
  || !Number.isInteger(repetition) || !Number.isInteger(attempt) || attempt < 1) {
  throw new Error("Usage: npm run benchmark:pilot -- <openai|claude|kimi|deepseek|grok|gemini> [repetition] [attempt]");
}
const artifact = await executeProvider(provider, repetition, attempt);
console.log(JSON.stringify({
  protocolVersion: artifact.protocolVersion,
  providerId: artifact.providerId,
  modelId: artifact.modelId,
  repetition: artifact.repetition,
  attempt: artifact.attempt,
  searchRequestsObserved: artifact.searchRequestsObserved,
  nativeSearchEvidence: artifact.nativeSearchEvidence,
  scoringEligibility: artifact.scoringEligibility,
  sourceUrlCount: artifact.sourceUrls.length,
  answerCharacters: artifact.answerText.length,
  latencyMs: artifact.latencyMs,
  outputSaved: true,
}, null, 2));
