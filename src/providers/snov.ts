import { ProviderUnavailableError } from "./contracts";

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

export class SnovProvider {
  readonly id = "snov";

  isConfigured(): boolean {
    return Boolean(process.env.SNOV_USER_ID?.trim() && process.env.SNOV_API_SECRET?.trim());
  }

  private async accessToken(): Promise<string> {
    const clientId = process.env.SNOV_USER_ID?.trim();
    const clientSecret = process.env.SNOV_API_SECRET?.trim();
    if (!clientId || !clientSecret) throw new ProviderUnavailableError(this.id, new Error("SNOV_USER_ID and SNOV_API_SECRET are not configured"));
    const response = await fetch("https://api.snov.io/v1/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    const body = await response.json() as { access_token?: string; message?: string };
    if (!response.ok || !body.access_token) throw new ProviderUnavailableError(this.id, new Error(body.message ?? `HTTP ${response.status}`));
    return body.access_token;
  }

  async domainEmails(domain: string): Promise<SnovDomainEmail[]> {
    const token = await this.accessToken();
    const start = await fetch("https://api.snov.io/v2/domain-search/domain-emails/start", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ domain }),
    });
    const task = await start.json() as SnovTaskResponse & { message?: string };
    if (!start.ok || !task.links?.result) throw new ProviderUnavailableError(this.id, new Error(task.message ?? `HTTP ${start.status}`));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await fetch(task.links.result, { headers: { authorization: `Bearer ${token}` } });
      const body = await result.json() as {
        data?: Array<{ email?: string; smtp_status?: string; first_name?: string; last_name?: string; position?: string; source_url?: string }>;
        meta?: { status?: string };
        message?: string;
      };
      if (!result.ok) throw new ProviderUnavailableError(this.id, new Error(body.message ?? `HTTP ${result.status}`));
      if (body.meta?.status === "completed" || body.data?.length) {
        return (body.data ?? []).flatMap((item) => item.email ? [{
          email: item.email.toLowerCase(),
          status: item.smtp_status === "valid" ? "Verified" as const : item.smtp_status === "not_valid" ? "Invalid" as const : "Unknown" as const,
          firstName: item.first_name,
          lastName: item.last_name,
          position: item.position,
          sourceUrl: item.source_url,
        }] : []);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return [];
  }
}
