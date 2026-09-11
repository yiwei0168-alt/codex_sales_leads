import { ProviderUnavailableError } from "./contracts";
import {budgetedFetch} from "@/lib/billing/paid-fetch";
import {setTimeout as delay} from "node:timers/promises";
import type { ContactLookupProvider, ContactLookupRequest, ContactLookupResult } from "./contact-lookup";

interface SnovTaskResponse {
  meta?: { task_hash?: string };
  links?: { result?: string };
}

export interface SnovDomainEmail {
  email: string;
  status: "Verified" | "Unknown" | "Invalid";
  firstName?: string;
  lastName?: string;
  position?: string;
  sourceUrl?: string;
}

export class SnovProvider implements ContactLookupProvider {
  readonly id = "snov";
  private readonly transport:typeof fetch;
  constructor(transport:typeof fetch=fetch){this.transport=budgetedFetch(transport);}

  isConfigured(): boolean {
    return Boolean(process.env.SNOV_USER_ID?.trim() && process.env.SNOV_API_SECRET?.trim());
  }

  private async accessToken(signal?: AbortSignal): Promise<string> {
    const clientId = process.env.SNOV_USER_ID?.trim();
    const clientSecret = process.env.SNOV_API_SECRET?.trim();
    if (!clientId || !clientSecret) throw new ProviderUnavailableError(this.id, new Error("SNOV_USER_ID and SNOV_API_SECRET are not configured"));
    const response = await this.transport("https://api.snov.io/v1/oauth/access_token", {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    const body = await response.json() as { access_token?: string; message?: string };
    if (!response.ok || !body.access_token) throw new ProviderUnavailableError(this.id, new Error(body.message ?? `HTTP ${response.status}`));
    return body.access_token;
  }

  async domainEmails(domain: string, signal?: AbortSignal): Promise<SnovDomainEmail[]> {
    const token = await this.accessToken(signal);
    const start = await this.transport("https://api.snov.io/v2/domain-search/domain-emails/start", {
      method: "POST",
      redirect: "error",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ domain }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    const task = await start.json() as SnovTaskResponse & { message?: string };
    if (!start.ok || !task.links?.result) throw new ProviderUnavailableError(this.id, new Error(task.message ?? `HTTP ${start.status}`));
    const resultUrl=new URL(task.links.result);
    if(resultUrl.origin!=="https://api.snov.io"||resultUrl.username||resultUrl.password||resultUrl.search||resultUrl.hash
      ||!/^\/v2\/domain-search\/domain-emails\/result\/[a-zA-Z0-9_-]+$/.test(resultUrl.pathname)){
      throw new ProviderUnavailableError(this.id,new Error("Untrusted Snov result URL"));
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const result = await this.transport(resultUrl, { redirect:"error",headers: { authorization: `Bearer ${token}` },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
      const body = await result.json() as {
        data?: Array<{ email?: string; smtp_status?: string; first_name?: string; last_name?: string; position?: string; source_url?: string }>;
        meta?: { status?: string };
        status?: string;
        message?: string;
      };
      if (!result.ok) throw new ProviderUnavailableError(this.id, new Error(body.message ?? `HTTP ${result.status}`));
      if ((body.status??body.meta?.status) === "completed") {
        if(!Array.isArray(body.data))throw new ProviderUnavailableError(this.id,new Error("Invalid completed Snov result"));
        return (body.data ?? []).flatMap((item) => item.email ? [{
          email: item.email.toLowerCase(),
          status: item.smtp_status === "valid" ? "Verified" as const : item.smtp_status === "not_valid" ? "Invalid" as const : "Unknown" as const,
          firstName: item.first_name,
          lastName: item.last_name,
          position: item.position,
          sourceUrl: item.source_url,
        }] : []);
      }
      if(attempt<5)await delay(1_000,undefined,{signal});
    }
    throw new ProviderUnavailableError(this.id,new Error("Snov polling incomplete; result unknown, do not cache as empty"));
  }

  async lookupCompany(input: ContactLookupRequest, signal?: AbortSignal): Promise<ContactLookupResult> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const emails = await this.domainEmails(input.domain, signal);
    return {
      provider: this.id,
      contacts: emails.map((item) => ({
        fullName: [item.firstName, item.lastName].filter(Boolean).join(" ") || undefined,
        firstName: item.firstName,
        lastName: item.lastName,
        jobTitle: item.position,
        email: item.email,
        emailStatus: item.status,
        sourceUrl: item.sourceUrl,
      })),
      warnings: ["仅获取域名邮箱第一页（最多50条）；不自动付费翻页。域名邮箱不是已验证的具名联系人。"],
    };
  }
}
