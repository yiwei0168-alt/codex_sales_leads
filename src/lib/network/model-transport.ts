import { fetch as undiciFetch, ProxyAgent } from "undici";
import {observeModelTransport} from './transport-observation';

type ProxyEnvironment = "GEMINI_PROXY_URL" | "MODEL_PROXY_URL";

const agents = new Map<string, ProxyAgent>();
const defaultFetch = fetch;
const responseRetirements=new WeakMap<Response,()=>void>();

/** A fetch can succeed before its response stream loses the proxy socket. */
export function retireModelResponseTransport(response:Response,error:unknown){
  if(brokenConnection(error))responseRetirements.get(response)?.();
}

function brokenConnection(error:unknown):boolean {
  const seen=new Set<object>();
  while(error&&typeof error==='object'&&!seen.has(error)){
    seen.add(error);
    const value=error as {code?:unknown;cause?:unknown};
    if(['ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(String(value.code)))return true;
    error=value.cause;
  }
  return false;
}

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
  if (url.hostname === "openrouter.ai") {
    if (/^(?:z-ai\/glm-|deepseek\/|moonshotai\/)/i.test(model ?? "")) return null;
    return "MODEL_PROXY_URL";
  }
  if (["dns.alidns.com", "places.googleapis.com", "api.exa.ai", "api.search.brave.com", "www.searchapi.io",
    "api.tavily.com"].includes(url.hostname)) return "MODEL_PROXY_URL";
  return null;
}

function localProxyUrl(name: ProxyEnvironment): string {
  const configured = process.env[name]?.trim();
  if (!configured) throw new Error(`${name} is required for this API route`);
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
  return async (request, options) => {
    // A caller may retain this transport across multiple requests. Resolve the
    // current pool at invocation time so it cannot reuse a retired dispatcher.
    let selectedAgent=agents.get(url);
    if(!selectedAgent){selectedAgent=new ProxyAgent(url);agents.set(url,selectedAgent);}
    const retire=()=>{
      if(agents.get(url)===selectedAgent){agents.delete(url);void selectedAgent.close().catch(()=>undefined);}
    };
    try{const response=await observeModelTransport(request,options,()=>undiciFetch(request as Parameters<typeof undiciFetch>[0], {
      ...options,
      dispatcher: selectedAgent,
    } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>);
    responseRetirements.set(response,retire);return response;}
    catch(error){
      // Never replay a potentially paid request. Retire the failed pool for the
      // next independent request; close drains concurrent work, unlike destroy.
      if(brokenConnection(error))retire();
      throw error;
    }
  };
}
