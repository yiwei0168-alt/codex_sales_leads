export interface ContactLookupRequest {
  companyId: string;
  companyName: string;
  websiteUrl: string;
  domain: string;
  countryCode: string;
  targetRoles: string[];
}

export interface ContactLookupCandidate {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
  emailStatus?: "Verified" | "Unknown" | "Invalid";
  phone?: string;
  publicProfileUrl?: string;
  sourceUrl?: string;
}

export interface ContactLookupResult {
  provider: string;
  contacts: ContactLookupCandidate[];
  creditsUsed?: number;
  providerRequestId?: string;
  warnings: string[];
}

export interface ContactLookupProvider {
  readonly id: string;
  isConfigured(): boolean;
  lookupCompany(input: ContactLookupRequest, signal?: AbortSignal): Promise<ContactLookupResult>;
}

export class DisabledContactLookupProvider implements ContactLookupProvider {
  readonly id = "disabled";
  isConfigured(): boolean { return false; }
  async lookupCompany(): Promise<ContactLookupResult> {
    throw new Error("Contact lookup is disabled. Set CONTACT_LOOKUP_ENABLED=true and configure a provider first.");
  }
}
