import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChannelRole } from "@/lib/domain";
import { interpretAssistantRequest } from "@/lib/assistant/intent";
import {
  buildGlobalLeadSearchQueries,
  classifyGlobalLeadSearchResult,
  globalLeadDisplayName,
  selectGlobalLeadSearchCandidates,
  type GlobalLeadSearchCandidate,
} from "@/lib/leads/global-search";
import { extractDomainEmails } from "@/lib/leads/contact-extraction";
import {
  TavilySearchProvider,
  type TavilyExtractResponse,
  type TavilySearchInput,
  type TavilySearchResponse,
  type TavilySearchResult,
} from "@/providers/tavily";

import { loadPilotPrompt } from "./benchmark";

const experimentRoot = path.resolve("experiments/global-model-lead-benchmark");
const payAsYouGoUsdPerCredit = 0.008;
const tavilyPricingSource = "https://docs.tavily.com/documentation/api-credits";
const perRequestTimeoutMs = 45_000;

type SearchPhase = "discovery" | "official-contact" | "public-contact" | "domain-email";

type MeteredQuery = {
  phase: SearchPhase;
  query: string;
  creditsUsed: number | null;
  resultCount: number | null;
  failed: boolean;
};

type RequestFailure = {
  operation: "search" | "extract";
  phase: SearchPhase | "official-extract";
  message: string;
};

export type ProductResourceUsage = {
  searchQueries: number;
  extractionRequests: number;
  externalRequests: number;
  searchCredits: number;
  extractCredits: number;
  totalCredits: number;
  estimatedCostUsdPayAsYouGo: number;
  costBasis: {
    usdPerCredit: number;
    sourceUrl: string;
    note: string;
  };
  failedExternalRequests: number;
};

type PublicNamedContact = {
  fullName: string;
  jobTitle: string | null;
  sourceUrl: string;
};

type PublicContactMethod = {
  value: string;
  sourceUrl: string;
};

export type ProductComparatorCandidate = {
  companyName: string;
  domain: string;
  role: ChannelRole;
  providerScore: number;
  discoveryQuery: string;
  discoveryEvidence: TavilySearchResult;
  cudyEvidence: TavilySearchResult[];
  namedContacts: PublicNamedContact[];
  publicEmails: PublicContactMethod[];
  publicPhones: PublicContactMethod[];
  additionalEvidence: TavilySearchResult[];
  enrichmentErrors: string[];
};

export type ProductComparatorArtifact = {
  protocolVersion: string;
  comparatorType: "product";
  providerId: "sales-lead-copilot";
  modelId: "sales-lead-copilot-v0.3";
  countryCode: string;
  repetition: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  automaticRetries: 0;
  promptSha256: string;
  inputPrompt: string;
  searchRequestsObserved: number;
  nativeSearchEvidence: "observed";
  scoringEligibility: "eligible";
  sourceUrls: string[];
  answerText: string;
  resourceUsage: ProductResourceUsage;
  rawProviderResponse: {
    queries: MeteredQuery[];
    requestFailures: RequestFailure[];
    candidates: ProductComparatorCandidate[];
  };
};

class ProductResourceMeter {
  readonly queries: MeteredQuery[] = [];
  readonly requestFailures: RequestFailure[] = [];
  searchCredits = 0;
  extractCredits = 0;
  externalRequests = 0;
  extractionRequests = 0;

  constructor(private readonly provider: TavilySearchProvider, private readonly overallSignal: AbortSignal) {}

  private requestSignal(): AbortSignal {
    return AbortSignal.any([this.overallSignal, AbortSignal.timeout(perRequestTimeoutMs)]);
  }

  async search(phase: SearchPhase, input: TavilySearchInput): Promise<TavilySearchResponse> {
    const measurement: MeteredQuery = { phase, query: input.query, creditsUsed: null, resultCount: null, failed: false };
    this.queries.push(measurement);
    this.externalRequests += 1;
    try {
      const response = await this.provider.search(input, this.requestSignal());
      measurement.creditsUsed = response.creditsUsed;
      measurement.resultCount = response.results.length;
      this.searchCredits += response.creditsUsed;
      return response;
    } catch (error) {
      measurement.failed = true;
      this.requestFailures.push({ operation: "search", phase, message: errorMessage(error) });
      throw error;
    }
  }

  async extract(urls: string[]): Promise<TavilyExtractResponse> {
    if (urls.length === 0) return { results: [], failedUrls: [], creditsUsed: 0 };
    this.externalRequests += 1;
    this.extractionRequests += 1;
    try {
      const response = await this.provider.extract(urls, this.requestSignal());
      this.extractCredits += response.creditsUsed;
      return response;
    } catch (error) {
      this.requestFailures.push({ operation: "extract", phase: "official-extract", message: errorMessage(error) });
      throw error;
    }
  }

  summary(): ProductResourceUsage {
    const totalCredits = this.searchCredits + this.extractCredits;
    return {
      searchQueries: this.queries.length,
      extractionRequests: this.extractionRequests,
      externalRequests: this.externalRequests,
      searchCredits: this.searchCredits,
      extractCredits: this.extractCredits,
      totalCredits,
      estimatedCostUsdPayAsYouGo: Number((totalCredits * payAsYouGoUsdPerCredit).toFixed(4)),
      costBasis: {
        usdPerCredit: payAsYouGoUsdPerCredit,
        sourceUrl: tavilyPricingSource,
        note: "Pay-as-you-go list price; the account's actual plan or free monthly allowance can make effective cost lower.",
      },
      failedExternalRequests: this.requestFailures.length,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function cleanText(value: string, maximum = 220): string {
  return value.replace(/\s+/g, " ").replace(/\|/g, "/").trim().slice(0, maximum);
}

function cleanPersonName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").replace(/\s*\|.*$/, "").trim();
  if (name.length < 5 || name.length > 80) return null;
  const parts = name.split(" ");
  if (parts.length < 2 || parts.length > 6) return null;
  if (!parts.every((part) => /^[\p{L}.'’\-]+$/u.test(part))) return null;
  return name;
}

function jobTitleFromText(text: string): string | null {
  const match = text.match(/\b(CEO|CTO|CIO|COO|Founder|Co-Founder|Managing Director|General Manager|Sales Director|Sales Manager|Business Development Manager|Purchasing Manager|Procurement Manager|Category Manager|Geschäftsführer(?:in)?|Geschäftsleitung|Vertriebsleiter(?:in)?|Einkaufsleiter(?:in)?|Leiter(?:in)?\s+(?:Vertrieb|Einkauf|Business Development|Produktmanagement))\b/iu);
  return match ? cleanText(match[0], 100) : null;
}

function contactsFromSearch(companyName: string, domain: string, results: TavilySearchResult[]): PublicNamedContact[] {
  const companyToken = companyName.split(/\s+/)[0]?.toLocaleLowerCase("de");
  const domainToken = domain.split(".")[0];
  const contacts = results.flatMap((result) => {
    if (!/linkedin\.com\/in\//i.test(result.url)) return [];
    const fullName = cleanPersonName(result.title.split(/\s+[–—-]\s+|\s+\|\s+/)[0] ?? "");
    if (!fullName) return [];
    const haystack = `${result.title} ${result.content}`.toLocaleLowerCase("de");
    if (companyToken && !haystack.includes(companyToken) && !haystack.includes(domainToken)) return [];
    return [{ fullName, jobTitle: jobTitleFromText(`${result.title} ${result.content}`), sourceUrl: result.url }];
  });
  return uniqueBy(contacts, (contact) => `${contact.fullName.toLocaleLowerCase("de")}:${contact.sourceUrl}`).slice(0, 5);
}

export function extractGermanPublicPhones(text: string): string[] {
  const withoutUrls = text.replace(/https?:\/\/\S+/giu, " ");
  const matches = withoutUrls.match(/(?:\+49|0)(?:[\s()./\-]*\d){7,14}/g) ?? [];
  return [...new Set(matches.map((value) => cleanText(value, 40)).filter((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  }))];
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

async function settledSearch(
  meter: ProductResourceMeter,
  phase: Exclude<SearchPhase, "discovery">,
  input: TavilySearchInput,
): Promise<{ response: TavilySearchResponse | null; error: string | null }> {
  try {
    return { response: await meter.search(phase, input), error: null };
  } catch (error) {
    return { response: null, error: errorMessage(error) };
  }
}

async function enrichCandidate(
  candidate: GlobalLeadSearchCandidate,
  discoveryQuery: string,
  country: string,
  meter: ProductResourceMeter,
): Promise<ProductComparatorCandidate> {
  const companyName = globalLeadDisplayName(candidate.result, candidate.domain);
  const requests = await Promise.all([
    settledSearch(meter, "official-contact", {
      query: `site:${candidate.domain} Kontakt Vertrieb Einkauf Geschäftsführung Team Impressum E-Mail Telefon`, country,
      searchDepth: "basic", maxResults: 6, includeRawContent: true, includeDomains: [candidate.domain],
    }),
    settledSearch(meter, "public-contact", {
      query: `"${companyName}" "${candidate.domain}" Geschäftsführer Vertriebsleiter Einkauf Category Manager LinkedIn E-Mail`, country,
      searchDepth: "advanced", maxResults: 8, includeRawContent: true,
    }),
    settledSearch(meter, "domain-email", {
      query: `site:${candidate.domain} "@${candidate.domain}"`, country, searchDepth: "basic", maxResults: 8,
      includeRawContent: true, includeDomains: [candidate.domain],
    }),
  ]);
  const [official, publicContact, domainEmail] = requests.map((item) => item.response);
  const enrichmentErrors = requests.flatMap((item) => item.error ? [item.error] : []);
  const combined = uniqueBy([
    ...(official?.results ?? []),
    ...(publicContact?.results ?? []),
    ...(domainEmail?.results ?? []),
  ], (result) => result.url);
  const officialUrls = combined.filter((result) => sameDomain(result.url, candidate.domain)).slice(0, 5).map((result) => result.url);
  let extracted: TavilyExtractResponse = { results: [], failedUrls: [], creditsUsed: 0 };
  try {
    extracted = await meter.extract(officialUrls);
  } catch (error) {
    enrichmentErrors.push(errorMessage(error));
  }
  const extractedByUrl = new Map(extracted.results.map((item) => [item.url, item.rawContent]));
  const officialEvidence = combined.filter((result) => sameDomain(result.url, candidate.domain));
  const publicEmails: PublicContactMethod[] = [];
  const publicPhones: PublicContactMethod[] = [];
  for (const result of officialEvidence) {
    const text = [result.content, result.rawContent ?? "", extractedByUrl.get(result.url) ?? ""].join("\n");
    for (const email of extractDomainEmails(text, candidate.domain)) publicEmails.push({ value: email, sourceUrl: result.url });
    for (const phone of extractGermanPublicPhones(text)) publicPhones.push({ value: phone, sourceUrl: result.url });
  }
  return {
    companyName,
    domain: candidate.domain,
    role: candidate.role,
    providerScore: candidate.result.score,
    discoveryQuery,
    discoveryEvidence: candidate.result,
    cudyEvidence: [],
    namedContacts: contactsFromSearch(companyName, candidate.domain, publicContact?.results ?? []),
    publicEmails: uniqueBy(publicEmails, (finding) => finding.value).slice(0, 8),
    publicPhones: uniqueBy(publicPhones, (finding) => finding.value).slice(0, 5),
    additionalEvidence: officialEvidence.slice(0, 8),
    enrichmentErrors,
  };
}

function tableCell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

function candidateSources(candidate: ProductComparatorCandidate): string[] {
  return [...new Set([
    candidate.discoveryEvidence.url,
    ...candidate.namedContacts.map((item) => item.sourceUrl),
    ...candidate.publicEmails.map((item) => item.sourceUrl),
    ...candidate.publicPhones.map((item) => item.sourceUrl),
    ...candidate.additionalEvidence.map((item) => item.url),
  ])];
}

export function formatProductComparatorAnswer(
  countryName: string,
  candidates: ProductComparatorCandidate[],
  resourceUsage: ProductResourceUsage,
): string {
  const lines = [
    `# ${countryName} 渠道销售线索（Sales Lead Copilot）`,
    "",
    "以下候选按产品当前的搜索相关性评分排序。是否已有Cudy合作不参与排序；公开网页中未直接出现的联系人或联系方式不作推测，最终潜在合作匹配度由统一的证据化审核规则评定。",
    "",
    "| # | 公司 | 渠道角色与潜在适配理由 | 公开联系人与联系方式 | 来源 |",
    "|---:|---|---|---|---|",
  ];
  candidates.forEach((candidate, index) => {
    const reason = `${candidate.role}；${cleanText(candidate.discoveryEvidence.content || candidate.discoveryEvidence.title, 240)}`;
    const contactParts = [
      ...candidate.namedContacts.slice(0, 3).map((contact) => `${contact.fullName}${contact.jobTitle ? `（${contact.jobTitle}）` : ""}`),
      ...candidate.publicEmails.slice(0, 5).map((finding) => finding.value),
      ...candidate.publicPhones.slice(0, 3).map((finding) => finding.value),
    ];
    const sources = candidateSources(candidate).slice(0, 6).map((url, sourceIndex) => `[${sourceIndex + 1}](${url})`).join(" ");
    lines.push(`| ${index + 1} | **${tableCell(candidate.companyName)}** | ${tableCell(reason)} | ${tableCell(contactParts.join("；") || "未在公开网页中确认")} | ${sources} |`);
  });
  lines.push(
    "",
    "## 运行资源说明",
    "",
    `本次使用 ${resourceUsage.searchQueries} 个搜索查询、${resourceUsage.extractionRequests} 个页面提取请求，共 ${resourceUsage.externalRequests} 个外部请求；消耗 ${resourceUsage.totalCredits} Tavily credits。按 pay-as-you-go 牌价估算为 US$${resourceUsage.estimatedCostUsdPayAsYouGo.toFixed(4)}，实际套餐成本可能更低。`,
  );
  return lines.join("\n");
}

async function assertArtifactDoesNotExist(paths: string[]): Promise<void> {
  for (const file of paths) {
    try {
      await access(file);
      throw new Error(`Refusing to overwrite an existing benchmark artifact: ${file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function executeProductComparator(repetition: number): Promise<ProductComparatorArtifact> {
  const { prompt, runDate, pilot } = await loadPilotPrompt();
  const comparator = pilot.productComparator;
  if (!comparator.enabled || !comparator.sameUserPrompt) throw new Error("Sales Lead Copilot comparator is not enabled with the same prompt");
  if (!Number.isInteger(repetition) || repetition < 1 || repetition > comparator.repetitionsPerSystem) {
    throw new Error(`Repetition must be between 1 and ${comparator.repetitionsPerSystem}`);
  }
  const outputDirectory = path.join(experimentRoot, pilot.storage.rawResultsDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const baseName = `${runDate}-${pilot.countryCode}-${pilot.artifactTag}-sales-lead-copilot-r${repetition}`;
  const artifactPath = path.join(outputDirectory, `${baseName}.json`);
  const failedPath = path.join(outputDirectory, `${baseName}.failed.json`);
  await assertArtifactDoesNotExist([artifactPath, failedPath]);

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const timeoutMs = comparator.sameTimeoutMinutes * 60_000;
  const overallSignal = AbortSignal.timeout(timeoutMs);
  const meter = new ProductResourceMeter(new TavilySearchProvider({ maxAttempts: 1 }), overallSignal);
  try {
    const interpreted = interpretAssistantRequest(prompt);
    if (interpreted.intent !== "lead-search" || !interpreted.plan) throw new Error("The frozen prompt did not resolve to a lead-search plan");
    const plan = { ...interpreted.plan, targetCount: comparator.samePrimaryCompanyCutoff };
    if (plan.countryCode !== pilot.countryCode) throw new Error(`Prompt resolved to ${plan.countryCode}, expected ${pilot.countryCode}`);
    const providerCountry = new Intl.DisplayNames(["en"], { type: "region" }).of(plan.countryCode)?.toLowerCase() ?? plan.countryName.toLowerCase();
    const querySpecs = buildGlobalLeadSearchQueries(plan);
    const candidates: GlobalLeadSearchCandidate[] = [];
    const queryTextById = new Map<string, string>();
    for (const [index, spec] of querySpecs.entries()) {
      const queryId = `discovery-${index + 1}`;
      queryTextById.set(queryId, spec.query);
      const response = await meter.search("discovery", {
        query: spec.query,
        country: providerCountry,
        searchDepth: "basic",
        maxResults: 20,
      });
      for (const result of response.results) {
        const classified = classifyGlobalLeadSearchResult(result);
        if (!classified.rejectionReason && classified.domain) {
          candidates.push({ role: spec.role, result, domain: classified.domain, queryId });
        }
      }
    }
    const selected = selectGlobalLeadSearchCandidates(candidates, comparator.samePrimaryCompanyCutoff);
    if (selected.length === 0) throw new Error("No product candidates passed the discovery filters");

    const enriched: ProductComparatorCandidate[] = new Array(selected.length);
    let nextIndex = 0;
    async function worker(): Promise<void> {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= selected.length) return;
        enriched[index] = await enrichCandidate(
          selected[index],
          queryTextById.get(selected[index].queryId) ?? "",
          providerCountry,
          meter,
        );
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, selected.length) }, () => worker()));
    if (overallSignal.aborted) throw overallSignal.reason ?? new DOMException("Product comparator timed out", "TimeoutError");
    const resourceUsage = meter.summary();
    const answerText = formatProductComparatorAnswer(pilot.countryName, enriched, resourceUsage);
    const sourceUrls = [...new Set(enriched.flatMap(candidateSources))];
    const artifact: ProductComparatorArtifact = {
      protocolVersion: pilot.protocolVersion,
      comparatorType: "product",
      providerId: "sales-lead-copilot",
      modelId: "sales-lead-copilot-v0.3",
      countryCode: pilot.countryCode,
      repetition,
      startedAt,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedMs,
      automaticRetries: 0,
      promptSha256: createHash("sha256").update(prompt).digest("hex"),
      inputPrompt: prompt,
      searchRequestsObserved: meter.queries.length,
      nativeSearchEvidence: "observed",
      scoringEligibility: "eligible",
      sourceUrls,
      answerText,
      resourceUsage,
      rawProviderResponse: { queries: meter.queries, requestFailures: meter.requestFailures, candidates: enriched },
    };
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return artifact;
  } catch (error) {
    const failure = {
      protocolVersion: pilot.protocolVersion,
      status: "product_comparator_failure",
      providerId: "sales-lead-copilot",
      countryCode: pilot.countryCode,
      repetition,
      startedAt,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedMs,
      automaticRetries: 0,
      resourceUsage: meter.summary(),
      error: { name: error instanceof Error ? error.name : "Error", message: errorMessage(error) },
    };
    await writeFile(failedPath, `${JSON.stringify(failure, null, 2)}\n`, "utf8");
    throw error;
  }
}
