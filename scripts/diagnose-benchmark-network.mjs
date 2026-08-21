import dns from "node:dns/promises";
import nextEnv from "@next/env";
import { fetch as undiciFetch, ProxyAgent } from "undici";

nextEnv.loadEnvConfig(process.cwd());

function safeUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return { protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port || "default", pathname: parsed.pathname };
  } catch {
    return { invalid: true };
  }
}

const providers = {
  grok: process.env.XAI_BASE_URL,
  gemini: process.env.GEMINI_BASE_URL,
};

const report = {
  providers: {},
  proxies: Object.fromEntries(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"].map((name) => [name, safeUrl(process.env[name]) ?? (process.env[name] ? { configured: true } : null)])),
};

for (const [provider, value] of Object.entries(providers)) {
  const parsed = safeUrl(value);
  const entry = { configured: Boolean(value), url: parsed, dns: [], connectivity: null };
  if (value && parsed?.hostname) {
    try {
      entry.dns = await dns.lookup(parsed.hostname, { all: true });
    } catch (error) {
      entry.dnsError = error instanceof Error ? error.message : String(error);
    }
    try {
      const response = await fetch(new URL("/", value), { method: "HEAD", signal: AbortSignal.timeout(20_000) });
      entry.connectivity = { reachable: true, status: response.status };
    } catch (error) {
      entry.connectivity = {
        reachable: false,
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
        causeCode: error?.cause?.code ?? null,
      };
    }
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
      try {
        const response = await undiciFetch(new URL("/", value), {
          dispatcher: new ProxyAgent(proxyUrl),
          method: "HEAD",
          signal: AbortSignal.timeout(20_000),
        });
        entry.explicitProxyConnectivity = { reachable: true, status: response.status };
      } catch (error) {
        entry.explicitProxyConnectivity = {
          reachable: false,
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
          causeCode: error?.cause?.code ?? null,
        };
      }
    }
  }
  report.providers[provider] = entry;
}

console.log(JSON.stringify(report, null, 2));
