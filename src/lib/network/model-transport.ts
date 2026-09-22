import { fetch as undiciFetch, ProxyAgent } from "undici";

type ProxyEnvironment = "GEMINI_PROXY_URL" | "MODEL_PROXY_URL";

const agents = new Map<string, ProxyAgent>();
const defaultFetch = fetch;

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

function requestedModel(init?: RequestInit): string | null {
  if (typeof init?.body !== "string") return null;
  try {
    const body: unknown = JSON.parse(init.body);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const model = (body as Record<string, unknown>).model;
    return typeof model === "string" ? model : null;
  } catch {
    return null;
  }
}

export function modelProxyEnvironment(input: RequestInfo | URL, init?: RequestInit): ProxyEnvironment | null {
  const url = requestUrl(input);
  if (url.protocol !== "https:") return null;
  if (url.hostname === "generativelanguage.googleapis.com") return "GEMINI_PROXY_URL";
  if (url.hostname === "api.openai.com" || url.hostname === "api.anthropic.com") return "MODEL_PROXY_URL";
  const model = requestedModel(init);
  if (url.hostname === "openrouter.ai" && /^(?:openai|anthropic)\//i.test(model ?? "")) return "MODEL_PROXY_URL";
  return null;
}

function localProxyUrl(name: ProxyEnvironment): string {
  const configured = process.env[name]?.trim();
  if (!configured) throw new Error(`${name} is required for this model route`);
  const parsed = new URL(configured);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
    || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${name} must be a local HTTP proxy without credentials`);
  }
  return parsed.toString();
}

/** Leave injected transports untouched so tests and approved custom transports remain authoritative. */
export function modelRoutedTransport(
  transport: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): typeof fetch {
  if (transport !== defaultFetch) return transport;
  const proxyEnvironment = modelProxyEnvironment(input, init);
  if (!proxyEnvironment) return transport;
  const url = localProxyUrl(proxyEnvironment);
  let agent = agents.get(url);
  if (!agent) {
    agent = new ProxyAgent(url);
    agents.set(url, agent);
  }
  return (request, options) => undiciFetch(request as Parameters<typeof undiciFetch>[0], {
    ...options,
    dispatcher: agent,
  } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}
