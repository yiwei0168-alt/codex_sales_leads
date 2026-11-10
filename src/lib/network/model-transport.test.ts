import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ fetch: vi.fn(),agents:[] as Array<{close:ReturnType<typeof vi.fn>}> }));

vi.mock("undici", () => ({
  fetch: mocked.fetch,
  ProxyAgent: class {close=vi.fn().mockResolvedValue(undefined);constructor(){mocked.agents.push(this);}},
}));

import { modelProxyEnvironment, modelRoutedTransport,retireModelResponseTransport } from "./model-transport";
beforeEach(()=>{mocked.fetch.mockReset().mockResolvedValue(new Response(null));});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const openRouter = "https://openrouter.ai/api/v1/chat/completions";
const request = (model: string) => ({ method: "POST", body: JSON.stringify({ model }) });

describe("product external API network routes", () => {
  it('isolates router cancellation and retirement from generation and metadata pools',async()=>{
    vi.stubEnv('MODEL_PROXY_URL','http://127.0.0.1:17996');
    const init=request('openai/gpt-5.6-sol');
    await modelRoutedTransport(fetch,openRouter,init)(openRouter,init);
    const generation=mocked.fetch.mock.calls[0][1].dispatcher;
    const decisionUrl='https://openrouter.ai/api/alpha/decisions';
    const failure=Object.assign(new Error('reset'),{code:'ECONNRESET'});
    mocked.fetch.mockRejectedValueOnce(failure);
    await expect(modelRoutedTransport(fetch,decisionUrl,init)(decisionUrl,init)).rejects.toBe(failure);
    const decision=mocked.fetch.mock.calls[1][1].dispatcher;
    expect(decision).not.toBe(generation);expect(decision.close).toHaveBeenCalledOnce();expect(generation.close).not.toHaveBeenCalled();
    await modelRoutedTransport(fetch,openRouter,init)(openRouter,init);
    expect(mocked.fetch.mock.calls[2][1].dispatcher).toBe(generation);
    const metadataUrl='https://openrouter.ai/api/v1/key';
    await modelRoutedTransport(fetch,metadataUrl)(metadataUrl);
    const metadata=mocked.fetch.mock.calls[3][1].dispatcher;
    expect(metadata).not.toBe(generation);expect(metadata).not.toBe(decision);
  });
  it('retires an owned response pool after a socket failure during body consumption',async()=>{
    vi.stubEnv('MODEL_PROXY_URL','http://127.0.0.1:17995');
    const init=request('openai/gpt-5.6-sol'),transport=modelRoutedTransport(fetch,openRouter,init);
    mocked.fetch.mockResolvedValueOnce(new Response('partial')).mockResolvedValueOnce(new Response('next'));
    const response=await transport(openRouter,init),first=mocked.fetch.mock.calls[0][1].dispatcher;
    retireModelResponseTransport(response,new Error('invalid JSON'));expect(first.close).not.toHaveBeenCalled();
    const failure=new TypeError('terminated',{cause:Object.assign(new Error('socket'),{code:'UND_ERR_SOCKET'})});
    retireModelResponseTransport(new Response('unowned'),failure);expect(first.close).not.toHaveBeenCalled();
    retireModelResponseTransport(response,failure);expect(first.close).toHaveBeenCalledOnce();
    await transport(openRouter,init);
    expect(mocked.fetch.mock.calls[1][1].dispatcher).not.toBe(first);
    retireModelResponseTransport(response,failure);expect(first.close).toHaveBeenCalledOnce();
    expect(mocked.fetch.mock.calls[1][1].dispatcher.close).not.toHaveBeenCalled();
  });
  it('retires a reset proxy pool for the next request without replaying failed paid work',async()=>{
    vi.stubEnv('MODEL_PROXY_URL','http://127.0.0.1:17992');
    const failure=new TypeError('fetch failed',{cause:Object.assign(new Error('reset'),{code:'ECONNRESET'})});
    mocked.fetch.mockRejectedValueOnce(failure).mockResolvedValueOnce(new Response(null));
    const init=request('openai/gpt-5.6-sol');
    await expect(modelRoutedTransport(fetch,openRouter,init)(openRouter,init)).rejects.toBe(failure);
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    const first=mocked.fetch.mock.calls[0][1].dispatcher;
    expect(first.close).toHaveBeenCalledOnce();
    await modelRoutedTransport(fetch,openRouter,init)(openRouter,init);
    expect(mocked.fetch.mock.calls[1][1].dispatcher).not.toBe(first);
  });
  it('does not discard healthy pools for a timeout or an HTTP error response',async()=>{
    vi.stubEnv('MODEL_PROXY_URL','http://127.0.0.1:17993');
    const failure=new DOMException('deadline','TimeoutError'),init=request('openai/gpt-5.6-sol');
    mocked.fetch.mockRejectedValueOnce(failure).mockResolvedValueOnce(new Response(null,{status:503}));
    await expect(modelRoutedTransport(fetch,openRouter,init)(openRouter,init)).rejects.toBe(failure);
    const first=mocked.fetch.mock.calls[0][1].dispatcher;
    await modelRoutedTransport(fetch,openRouter,init)(openRouter,init);
    expect(mocked.fetch.mock.calls[1][1].dispatcher).toBe(first);expect(first.close).not.toHaveBeenCalled();
  });
  it('reuses a retained transport function with a fresh pool after reset',async()=>{
    vi.stubEnv('MODEL_PROXY_URL','http://127.0.0.1:17994');
    const init=request('openai/gpt-5.6-sol'),transport=modelRoutedTransport(fetch,openRouter,init);
    const failure=Object.assign(new Error('broken'),{code:'EPIPE'});
    mocked.fetch.mockRejectedValueOnce(failure).mockResolvedValueOnce(new Response(null));
    await expect(transport(openRouter,init)).rejects.toBe(failure);
    await transport(openRouter,init);
    expect(mocked.fetch).toHaveBeenCalledTimes(2);
    expect(mocked.fetch.mock.calls[0][1].dispatcher).not.toBe(mocked.fetch.mock.calls[1][1].dispatcher);
  });
  it("keeps GLM direct while routing OpenAI and Claude on the same gateway through the proxy", async () => {
    vi.stubEnv("MODEL_PROXY_URL", "http://127.0.0.1:7892");
    expect(modelProxyEnvironment(openRouter, request("z-ai/glm-5.3"))).toBeNull();
    expect(modelRoutedTransport(fetch, openRouter, request("z-ai/glm-5.3"))).toBe(fetch);
    for (const model of ["openai/gpt-5.6-sol", "anthropic/claude-sonnet-4.6"]) {
      const init = request(model);
      expect(modelProxyEnvironment(openRouter, init)).toBe("MODEL_PROXY_URL");
      await modelRoutedTransport(fetch, openRouter, init)(openRouter, init);
    }
    expect(mocked.fetch).toHaveBeenCalledTimes(2);
    expect(mocked.fetch.mock.calls.every((call) => call[1].dispatcher)).toBe(true);
  });

  it("routes Gemini through its proxy and never overrides an injected transport", () => {
    const gemini = "https://generativelanguage.googleapis.com/v1beta/interactions";
    vi.stubEnv("GEMINI_PROXY_URL", "http://127.0.0.1:7892");
    expect(modelProxyEnvironment(gemini, request("gemini-3.6-flash"))).toBe("GEMINI_PROXY_URL");
    const injected = vi.fn() as typeof fetch;
    expect(modelRoutedTransport(injected, gemini, request("gemini-3.6-flash"))).toBe(injected);
  });

  it("routes fixed search and evidence APIs through the local proxy", async () => {
    vi.stubEnv("MODEL_PROXY_URL", "http://127.0.0.1:7892");
    for (const url of [
      "https://dns.alidns.com/resolve",
      "https://places.googleapis.com/v1/places:searchText",
      "https://api.exa.ai/search",
      "https://api.search.brave.com/res/v1/web/search",
      "https://www.searchapi.io/api/v1/search",
      "https://api.tavily.com/search",
      "https://api.tavily.com/extract",
      "https://openrouter.ai/api/v1/key",
      openRouter,
    ]) {
      expect(modelProxyEnvironment(url)).toBe("MODEL_PROXY_URL");
      await modelRoutedTransport(fetch, url)(url);
    }
    expect(mocked.fetch).toHaveBeenCalledTimes(9);
    expect(mocked.fetch.mock.calls.every((call) => call[1].dispatcher)).toBe(true);
  });

  it("keeps the specified providers and conditional destinations direct", () => {
    for (const model of ["z-ai/glm-5.3", "deepseek/deepseek-v4-flash", "moonshotai/kimi-k3"]) {
      expect(modelProxyEnvironment(openRouter, request(model))).toBeNull();
    }
    for (const url of ["https://api.deepseek.com/chat/completions",
      "https://api.moonshot.cn/v1/chat/completions",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      "https://api.github.com/repos/example/repo/commits/main",
      "https://example.com/"]) {
      expect(modelProxyEnvironment(url)).toBeNull();
    }
  });

  it("fails closed when a required proxy is missing or non-local", () => {
    vi.stubEnv("MODEL_PROXY_URL", "");
    expect(() => modelRoutedTransport(fetch, openRouter, request("openai/gpt-5.6-sol"))).toThrow("MODEL_PROXY_URL is required");
    vi.stubEnv("MODEL_PROXY_URL", "http://example.com:7892");
    expect(() => modelRoutedTransport(fetch, openRouter, request("openai/gpt-5.6-sol"))).toThrow("local HTTP proxy");
    expect(() => modelRoutedTransport(fetch, "https://api.tavily.com/search")).toThrow("local HTTP proxy");
    expect(mocked.fetch).not.toHaveBeenCalled();
  });
});
