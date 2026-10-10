import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekProvider } from "./deepseek";
import { paidRequestFingerprint } from "@/lib/billing/paid-request-fingerprint";

afterEach(()=>vi.unstubAllEnvs());

describe("DeepSeekProvider", () => {
  it("requests JSON output and returns usage metadata", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "request-1",
      model: "deepseek-v4-flash",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ result: "ok" }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "test-key", fetchImplementation, maxAttempts: 1 });

    const response = await provider.execute<{ value: number }, { result: string }>({
      task: "contact-verification",
      modelVersion: "deepseek-v4-flash",
      promptVersion: "contact-evidence-v1",
      input: { value: 1 },
      evidenceIds: ["ev-1"],
    });

    expect(response.output).toEqual({ result: "ok" });
    expect(response.usage?.totalTokens).toBe(14);
    const request = JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body)) as {
      response_format: { type: string };
      reasoning: { enabled: boolean };
      temperature: number;
    };
    expect(request.response_format.type).toBe("json_object");
    expect(request.reasoning.enabled).toBe(false);
    expect(request.temperature).toBe(0);
    expect(fetchImplementation.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const wire=JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body));
    expect(wire.model).toBe("deepseek/deepseek-v4-flash");
    expect(wire.provider).toEqual({require_parameters:true,data_collection:"deny",allow_fallbacks:false});
    expect(fetchImplementation.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("rejects empty model content instead of accepting an unknown output", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "test-key", fetchImplementation, maxAttempts: 1 });

    await expect(provider.execute({
      task: "contact-verification",
      modelVersion: "deepseek-v4-flash",
      promptVersion: "contact-evidence-v1",
      input: {},
      evidenceIds: [],
    })).rejects.toThrow("Provider deepseek is unavailable");
  });

  it("routes Pro models through the gateway JSON transport", async () => {
    vi.stubEnv("DEEPSEEK_TRANSPORT","chat");
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "request-pro",
      model: "deepseek-v4-pro",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({result:"ok"}) } }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "test-key", baseUrl: "https://openrouter.ai/api/v1",
      fetchImplementation, maxAttempts: 1 });
    const response = await provider.execute<{ value: number }, { result: string }>({
      task: "lead-qualification", modelVersion: "deepseek-v4-pro", promptVersion: "test",
      input: { value: 1 }, evidenceIds: [], outputSchema: { type: "object" },
    });
    expect(response.output).toEqual({ result: "ok" });
    expect(response.usage?.totalTokens).toBe(17);
    expect(fetchImplementation.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = fetchImplementation.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body)) as {
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(body.messages[0].content).toContain("Your entire response MUST validate against this JSON Schema");
    expect(body.messages[1].content).not.toContain("requiredOutputSchema");
    expect((body as typeof body & { temperature: number }).temperature).toBe(0);
    expect(JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body)).reasoning).toEqual({enabled:true});
  });

  it("does not use native credentials or endpoints when the gateway is missing",async()=>{
    vi.stubEnv("OPENROUTER_API_KEY","");vi.stubEnv("DEEPSEEK_API_KEY","legacy-secret");
    vi.stubEnv("DEEPSEEK_BASE_URL","https://api.deepseek.com");
    const transport=vi.fn<typeof fetch>();
    const provider=new DeepSeekProvider({fetchImplementation:transport});
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.execute({task:"contact-verification",modelVersion:"deepseek-v4-flash",promptVersion:"v1",input:{},evidenceIds:[]})).rejects.toThrow("unavailable");
    expect(transport).not.toHaveBeenCalled();
    expect(()=>new DeepSeekProvider({apiKey:"fixture",baseUrl:"https://api.deepseek.com"})).toThrow("OpenRouter HTTPS");
  });

  it("matches actual gateway wire bytes and paid replay identity",async()=>{
    const request={task:"contact-verification" as const,modelVersion:"deepseek-flash",promptVersion:"v1",input:{value:1},evidenceIds:[]};
    let actualFingerprint="",actualBytes=0;
    const provider=new DeepSeekProvider({apiKey:"fixture",fetchImplementation:async(url,init)=>{
      actualFingerprint=paidRequestFingerprint("POST",new URL(String(url)),String(init?.body));
      actualBytes=Buffer.byteLength(String(init?.body));
      return Response.json({choices:[{finish_reason:"stop",message:{content:"{}"}}]});
    }});
    await provider.execute(request);
    expect(provider.paidRequestFingerprint(request)).toBe(actualFingerprint);
    expect(provider.requestBytes(request)).toBe(actualBytes);
  });

  it.each(["length","content_filter",undefined])("rejects incomplete output %s without retry",async(finish_reason)=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({choices:[{finish_reason,message:{content:"{}"}}]}));
    const provider=new DeepSeekProvider({apiKey:"fixture",fetchImplementation:transport,maxAttempts:3});
    await expect(provider.execute({task:"contact-verification",modelVersion:"deepseek-v4-flash",promptVersion:"v1",input:{},evidenceIds:[]})).rejects.toThrow("unavailable");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("does not retry an authentication or request-format failure", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Authentication failed" },
    }), { status: 401, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "bad-key", fetchImplementation, maxAttempts: 3 });

    await expect(provider.execute({
      task: "contact-verification",
      modelVersion: "deepseek-v4-flash",
      promptVersion: "contact-evidence-v1",
      input: {},
      evidenceIds: [],
    })).rejects.toThrow("Provider deepseek is unavailable");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
