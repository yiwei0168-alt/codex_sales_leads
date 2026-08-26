export function trustedEndpoint(baseUrl: string, allowedHosts: string[], path: string): string {
  const parsed = new URL(baseUrl.trim());
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Untrusted discovery-provider endpoint: ${parsed.hostname || "invalid"}`);
  }
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export async function requestJson<T>(
  provider: string,
  url: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  const response = await fetchImplementation(url, { ...init, signal: requestSignal });
  const text = await response.text();
  if (!response.ok) throw new Error(`${provider} HTTP ${response.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${provider} returned non-JSON content`);
  }
}

export function boundedResults(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value)));
}

export function publicUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      for (const match of item.matchAll(/https?:\/\/[^\s<>()\]"']+/g)) {
        try {
          const url = new URL(match[0].replace(/[.,;:!?，。；：！？）】]+$/, ""));
          if (url.protocol === "https:" || url.protocol === "http:") urls.add(url.toString());
        } catch { /* Ignore malformed provider URLs. */ }
      }
      return;
    }
    if (Array.isArray(item)) return item.forEach(visit);
    if (item && typeof item === "object") Object.values(item as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return [...urls].filter((value) => {
    const parsed = new URL(value);
    if (/^(?:www\.)?w3\.org$/i.test(parsed.hostname) && /\/(?:2000\/svg|1999\/xhtml)/i.test(parsed.pathname)) return false;
    if (/^(?:www\.)?google\.[a-z.]+$/i.test(parsed.hostname) && parsed.pathname === "/search") return false;
    return true;
  });
}
