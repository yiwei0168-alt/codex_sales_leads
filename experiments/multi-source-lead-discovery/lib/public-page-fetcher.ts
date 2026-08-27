import { isIP } from "node:net";

import type { CollectedPage, EvidencePageFetcher } from "./evidence-collector";

function privateIpLiteral(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!isIP(value)) return false;
  if (value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function safePublicUrl(value: string): URL {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password
    || hostname === "localhost" || hostname.endsWith(".localhost") || privateIpLiteral(hostname)) {
    throw new Error("Blocked non-public page target");
  }
  return parsed;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function pageText(body: string): string {
  return decodeEntities(body
    .replace(/<(?:script|style|svg|noscript|template)[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template)>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>|<\/section>|<\/article>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    .slice(0, 40_000);
}

function pageLinks(body: string, baseUrl: string): string[] {
  const values: string[] = [];
  for (const match of body.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = match[1] ?? match[2] ?? match[3];
    if (!href || /^(?:mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    try {
      const parsed = safePublicUrl(new URL(href, baseUrl).toString());
      parsed.hash = "";
      values.push(parsed.toString());
    } catch {
      continue;
    }
  }
  return [...new Set(values)].slice(0, 300);
}

export class PublicPageFetcher implements EvidencePageFetcher {
  constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  async fetch(url: string, signal?: AbortSignal): Promise<CollectedPage> {
    let current = safePublicUrl(url);
    for (let redirects = 0; redirects <= 4; redirects += 1) {
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const response = await this.fetchImplementation(current, {
        method: "GET", redirect: "manual", signal: combinedSignal,
        headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "user-agent": "CudyLeadEvidenceBenchmark/1.0" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`HTTP ${response.status} redirect without location`);
        current = safePublicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")
        && !contentType.includes("text/plain")) throw new Error(`Unsupported content type: ${contentType}`);
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > 5_000_000) throw new Error("Page exceeds 5 MB limit");
      const body = (await response.text()).slice(0, 5_000_000);
      const text = contentType.includes("text/plain") ? body.replace(/\s+/g, " ").trim().slice(0, 40_000) : pageText(body);
      if (text.length < 24) throw new Error("Page did not contain enough readable text");
      return { url: current.toString(), text, links: contentType.includes("text/plain") ? [] : pageLinks(body, current.toString()) };
    }
    throw new Error("Too many redirects");
  }
}
