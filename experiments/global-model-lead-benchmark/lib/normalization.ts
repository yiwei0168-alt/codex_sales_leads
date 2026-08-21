import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  deterministicBlindId,
  validateNormalizedCandidate,
  type NormalizedCandidate,
  type BenchmarkCompanyCategory,
} from "./judging";

export type MeasuredRun = {
  providerId: string;
  modelId: string;
  countryCode: string;
  repetition: number;
  attempt?: number;
  scoringEligibility: string;
  nativeSearchEvidence: string;
  answerText: string;
};

export type CandidateOccurrence = NormalizedCandidate & {
  extractionRule: "numbered_heading" | "numbered_table_row" | "bold_candidate";
  canonicalKey: string;
};

export type DeduplicatedCandidate = {
  blindCandidateId: string;
  canonicalKey: string;
  companyName: string;
  countryCode: string;
  occurrenceCount: number;
  occurrences: CandidateOccurrence[];
  mergedSourceUrls: string[];
  mergedOfficialWebsiteUrls: string[];
};

type CandidateMatch = {
  start: number;
  end: number;
  companyName: string;
  extractionRule: CandidateOccurrence["extractionRule"];
};

const GENERIC_TITLE_PATTERNS = [
  /^(?:weitere|other|andere|additional|summary|recommendation|follow-up|sources?|contacts?|notes?)/i,
  /^(?:其他|其它|更多|总结|建议|来源|联系|后续|需要|优先|優先|可能|调研|重要说明|进一步)/,
  /^(?:大型全球分销商|行业协会|產業協會|行業協會)/,
  /^(?:已证实|已證實|尚无|尚無|cudy technology|在德国|在德國|接触方式|接觸方式|下一步)/i,
  /(?:潜在渠道|跟进建议|检索局限|销售行动|证据来源|contact information|follow-up recommendations)$/i,
  /^(?:\d+[.)]?\s*)?(?:一级分销商|一級分銷商|tier[ -]?1(?: distributors?)?|distributors?|resellers?|retailers?|si|system integrators?)(?:\s*[（(].*)?$/i,
  /^(?:本次|目录页|目錄頁|the search|search limit)/i,
];

const LEGAL_SUFFIXES = /\b(?:gmbh|mbh|ag|se|ohg|kg|gbr|ug|e\.?\s*k\.?|inc|corp(?:oration)?|limited|ltd|llc|a\.?s\.?|sp\.?\s*z\.?\s*o\.?o\.?)\b/gi;
const COMPANY_LEGAL_SUFFIX = /\b(?:gmbh|mbh|ag|se|ohg|kg|gbr|ug|e\.?\s*k\.?|inc|corp(?:oration)?|limited|ltd|llc|a\.?s\.?|sp\.?\s*z\.?\s*o\.?o\.?)\b/i;
const NON_COMPANY_BOLD = /^(?:website|webseite|官网|網站|官方网站|業務|业务|在德业务|geschäft|standort|rolle|channel|渠道角色|角色与客户群|match|匹配|与cudy|cudy\s*匹配|覆盖|當地覆蓋|当地覆盖|risik|风险|風險|潜在冲突|來源|来源|依据|公開|公开|kontakt|contact|联系人|evidence|quellen|empfehlung|建议|注意|recherchedatum|检索基准|produkt|product|.*\bpack\b)/i;

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*(?:\d+[.)]\s*)/, "")
    .replace(/[：:]\s*$/, "")
    .replace(/\s*[–—-]{1,2}\s+.*$/, "")
    .replace(/\s*[（(].*$/, "")
    .trim();
}

function plausibleCompanyTitle(value: string): boolean {
  const cleaned = cleanInlineMarkdown(value);
  if (cleaned.length < 2 || cleaned.length > 180) return false;
  if (GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(cleaned))) return false;
  if (NON_COMPANY_BOLD.test(cleaned)) return false;
  return /[\p{L}\p{N}]/u.test(cleaned);
}

function collectCandidateMatches(answerText: string): CandidateMatch[] {
  const headings: CandidateMatch[] = [];
  const tableRows: CandidateMatch[] = [];
  const boldEntries: CandidateMatch[] = [];
  const plainNumberedEntries: CandidateMatch[] = [];
  const numberedHeading = /^#{2,6}\s+\d+[.)]\s+(.+)$/gmu;
  const numberedTableRow = /^\|\s*\d+\s*\|\s*([^|]+)\|.*$/gmu;
  const numberedBold = /^\s*\d+[.)]\s+\*\*([^*\n]+)\*\*/gmu;
  const plainNumbered = /^\s*\d+[.)]\s+([^\n]{2,180})$/gmu;
  const boldBullet = /^\s*-\s+\*\*([^*]+)\*\*(?:\s*\([^\n]*\))?/gmu;
  const boldStandalone = /^\*\*(?:\d+[.)]\s*)?([^*\n]+)\*\*(?:[ \t]*\([^\n)]*\))?[ \t]*$/gmu;
  const boldLead = /^\*\*(?:\d+[.)]\s*)?([^*\n]+)\*\*[ \t]*(?:\([^\n)]*\)[ \t]*)?(?:[–—-]|$)/gmu;

  for (const [regex, extractionRule, target] of [
    [numberedHeading, "numbered_heading", headings],
    [numberedTableRow, "numbered_table_row", tableRows],
    [numberedBold, "bold_candidate", boldEntries],
    [boldBullet, "bold_candidate", boldEntries],
    [boldStandalone, "bold_candidate", boldEntries],
    [boldLead, "bold_candidate", boldEntries],
  ] as const) {
    for (const match of answerText.matchAll(regex)) {
      const companyName = cleanInlineMarkdown(match[1]);
      if (!plausibleCompanyTitle(companyName) || match.index === undefined) continue;
      target.push({
        start: match.index,
        end: match.index + match[0].length,
        companyName,
        extractionRule,
      });
    }
  }

  for (const match of answerText.matchAll(plainNumbered)) {
    const companyName = cleanInlineMarkdown(match[1]);
    if (!plausibleCompanyTitle(companyName) || /[。！？；;：:]|\b(?:because|therefore|search|note)\b/i.test(companyName)
      || match.index === undefined) continue;
    plainNumberedEntries.push({
      start: match.index,
      end: match.index + match[0].length,
      companyName,
      extractionRule: "numbered_heading",
    });
  }

  const structuredEntries = headings.length > 0
    ? [...tableRows.filter((match) => match.start < headings[0].start), ...headings]
    : tableRows;
  const listEntries = [...boldEntries, ...plainNumberedEntries];
  const primary = structuredEntries.length > 0 ? structuredEntries : listEntries;
  const strongBoldAdditions = primary === listEntries ? [] : boldEntries.filter((match) => {
    const sourceLineEnd = answerText.indexOf("\n", match.start);
    const sourceLine = answerText.slice(match.start, sourceLineEnd === -1 ? answerText.length : sourceLineEnd);
    return COMPANY_LEGAL_SUFFIX.test(match.companyName) || /https?:\/\//i.test(sourceLine);
  });
  return [...primary, ...strongBoldAdditions]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((match, index, ordered) => index === 0 || match.start !== ordered[index - 1].start);
}

function inferClaimedCategoryWithSection(answerText: string, matchStart: number, excerpt: string): BenchmarkCompanyCategory | "unclear" {
  const direct = inferClaimedCategory(excerpt);
  if (direct !== "unclear") return direct;
  const precedingLines = answerText.slice(0, matchStart).split("\n").reverse();
  for (const line of precedingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 200) continue;
    const looksLikeSection = /^#{1,6}\s+/.test(trimmed)
      || /^\*\*[^*]+\*\*$/.test(trimmed)
      || /^(?:类别|類別|category|kategorie)\s*[一二三四1-4.)：: -]/i.test(trimmed);
    if (!looksLikeSection) continue;
    const sectionTitle = cleanInlineMarkdown(trimmed.replace(/^#{1,6}\s+/, ""))
      .replace(/^(?:[一二三四]+|\d+)[、.)\s]+/, "");
    const inferred = inferClaimedCategory(`类别：${sectionTitle}`);
    if (inferred !== "unclear") return inferred;
  }
  return "unclear";
}

export function isDegenerateProcessOutput(answerText: string): boolean {
  const compact = answerText.replace(/\s+/g, "").toLowerCase();
  if (/^i(?:'|’)ll search for\s+["“][\s\S]{500}/iu.test(answerText.trim())
    && collectCandidateMatches(answerText).length === 0) return true;
  const processMarkers = answerText.match(/(?:let me (?:search|compile|do (?:a few|more))|让我(?:继续|进行更多|搜索)|我需要搜索|maximum number of search steps|reached the maximum number of search)/giu) ?? [];
  if (processMarkers.length >= 2 && collectCandidateMatches(answerText).length === 0) return true;
  if (compact.length < 200) return false;

  const chunks = answerText
    .split(/[。.!?！？\n]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 8);
  const counts = new Map<string, number>();
  for (const chunk of chunks) counts.set(chunk, (counts.get(chunk) ?? 0) + 1);
  const mostRepeated = Math.max(0, ...counts.values());
  const repeatShare = chunks.length === 0 ? 0 : mostRepeated / chunks.length;
  return mostRepeated >= 8 && repeatShare >= 0.35 && collectCandidateMatches(answerText).length === 0;
}

export function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s)\]}>,，；;（(）”。。【\[]+/giu) ?? [];
  const normalized = urls.flatMap((raw) => {
    try {
      const decoded = raw.replace(/\\u003d/giu, "=");
      const url = new URL(decoded.replace(/[.。]+$/, ""));
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "srsltid") url.searchParams.delete(key);
      }
      return [url.toString()];
    } catch {
      return [];
    }
  });
  return [...new Set(normalized)];
}

function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  const compoundSuffixes = new Set(["co.uk", "com.au", "co.nz", "com.br", "com.cn"]);
  const lastTwo = labels.slice(-2).join(".");
  if (labels.length >= 3 && compoundSuffixes.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

function normalizedNameKey(companyName: string): string {
  return companyName
    .normalize("NFKD")
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\.(?:de|com|net|cz|at|ch)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("-");
}

function candidateDomain(companyName: string, urls: string[]): string | null {
  const nameTokens = normalizedNameKey(companyName).split("-").filter((token) => token.length >= 3);
  const excluded = new Set([
    "linkedin.com", "northdata.com", "crn.de", "heise.de", "geizhals.de", "itscope.com",
    "wer-zu-wem.de", "ifa-berlin.com", "cudy.com",
  ]);
  const domains = urls.flatMap((value) => {
    try { return [registrableDomain(new URL(value).hostname)]; } catch { return []; }
  });
  const matched = domains.find((domain) => nameTokens.some((token) => domain.replace(/[^a-z0-9]/g, "").includes(token.replace(/[^a-z0-9]/g, ""))));
  if (matched) return matched;
  return domains.find((domain) => !excluded.has(domain)) ?? null;
}

function officialWebsiteUrl(excerpt: string, urls: string[], companyName: string): string | null {
  const labeledLine = excerpt.split("\n").find((line) => /(?:官方网站|官方網站|公司官网|公司官網|官网|官網|official\s+(?:company\s+)?website|website|webseite)/iu.test(line));
  const labeledUrl = labeledLine ? extractUrls(labeledLine)[0] : undefined;
  if (labeledUrl) return labeledUrl;
  const domain = candidateDomain(companyName, urls);
  return domain === null ? null : urls.find((url) => {
    try { return registrableDomain(new URL(url).hostname) === domain; } catch { return false; }
  }) ?? null;
}

function inferClaimedClass(excerpt: string): NormalizedCandidate["claimedChannelClass"] {
  if (/(?:bestätigte|current cudy|已证实|已證實|当前\s*cudy|當前\s*cudy|cudy合作证据.{0,12}(?:是|✅)|cudy-belege.{0,12}ja)/iu.test(excerpt)) {
    return "confirmed_current_cudy";
  }
  if (/(?:retail|e-?tail|online.?händler|online.?shop|零售|電商|电商|fachhändler|reseller)/iu.test(excerpt)) {
    return "important_downstream";
  }
  if (/(?:distribut|großhandel|grosshandel|wholesale|批发|批發|一级|一級|import)/iu.test(excerpt)) {
    return "qualified_tier1";
  }
  return "unclear";
}

function inferClaimedCategory(excerpt: string): BenchmarkCompanyCategory | "unclear" {
  const normalized = excerpt.replace(/[*_`#]/g, "");
  if (/(?:类别|類別|category|kategorie)\s*[：:]?\s*(?:一级分销商|一級分銷商|tier[ -]?1|distribut|vad|wholesal|großhandel|grosshandel)/iu.test(normalized)) {
    return "tier1_distributor";
  }
  if (/(?:类别|類別|category|kategorie)\s*[：:]?\s*(?:reseller|var|经销商|經銷商|转售商|轉售商|fachhändler)/iu.test(normalized)) {
    return "reseller";
  }
  if (/(?:类别|類別|category|kategorie)\s*[：:]?\s*(?:retailer|retail|零售商|零售|einzelhändler|online.?shop)/iu.test(normalized)) {
    return "retailer";
  }
  if (/(?:类别|類別|category|kategorie)\s*[：:]?\s*(?:si\b|system\s*integrat|系统集成|系統整合|系统整合|systemhaus)/iu.test(normalized)) {
    return "si";
  }
  return "unclear";
}

function inferCudyRelationship(excerpt: string): NormalizedCandidate["claimedCudyRelationship"] {
  if (/(?:keine öffentliche cudy|尚无\s*cudy|尚無\s*cudy|未.*cudy.*证据|without.*cudy.*evidence|no.*cudy.*evidence)/iu.test(excerpt)) return "not_confirmed";
  if (/(?:cudy.{0,100}(?:产品|產品|product|sortiment|销售|銷售|在售|listet|verkauft|distribut)|(?:产品|產品|product|销售|銷售|在售|listet|verkauft|distribut).{0,100}cudy)/iu.test(excerpt)) return "confirmed";
  return "unclear";
}

function excerptEnd(answerText: string, match: CandidateMatch, next: CandidateMatch | undefined): number {
  if (match.extractionRule === "numbered_table_row") return answerText.indexOf("\n", match.end) === -1 ? answerText.length : answerText.indexOf("\n", match.end);
  const upperSection = answerText.slice(match.end).search(/^#{1,2}\s+/mu);
  const genericBoldSection = answerText.slice(match.end).search(/^\*\*(?:weitere|other|summary|recommendation|其他|更多|建议|來源|来源)/imu);
  const boundaries = [
    next?.start ?? answerText.length,
    upperSection === -1 ? answerText.length : match.end + upperSection,
    genericBoldSection === -1 ? answerText.length : match.end + genericBoldSection,
    match.start + 6000,
  ];
  return Math.min(answerText.length, ...boundaries);
}

export function extractCandidateOccurrences(run: MeasuredRun, secretSalt: string): CandidateOccurrence[] {
  if (run.nativeSearchEvidence !== "observed" || isDegenerateProcessOutput(run.answerText)) return [];
  const matches = collectCandidateMatches(run.answerText);
  const blindRunId = deterministicBlindId("R", secretSalt, `${run.providerId}:${run.modelId}:${run.countryCode}:${run.repetition}`);
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const candidates: CandidateOccurrence[] = [];
  const categoryCounts = new Map<BenchmarkCompanyCategory, number>();

  for (let index = 0; index < matches.length && candidates.length < 40; index += 1) {
    const match = matches[index];
    const excerpt = run.answerText.slice(match.start, excerptEnd(run.answerText, match, matches[index + 1])).trim();
    const claimedCategory = inferClaimedCategoryWithSection(run.answerText, match.start, excerpt);
    const currentCategoryCount = claimedCategory === "unclear" ? 0 : (categoryCounts.get(claimedCategory) ?? 0);
    if (claimedCategory !== "unclear" && currentCategoryCount >= 10) continue;
    const sourceUrls = extractUrls(excerpt);
    const websiteUrl = officialWebsiteUrl(excerpt, sourceUrls, match.companyName);
    const domain = websiteUrl === null ? candidateDomain(match.companyName, sourceUrls) : registrableDomain(new URL(websiteUrl).hostname);
    const nameKey = normalizedNameKey(match.companyName);
    const canonicalKey = domain ? `domain:${domain}` : `name:${nameKey}:${run.countryCode}`;
    if (seen.has(canonicalKey) || seenNames.has(nameKey)) continue;
    seen.add(canonicalKey);
    seenNames.add(nameKey);
    const candidate: CandidateOccurrence = {
      blindCandidateId: deterministicBlindId("C", secretSalt, canonicalKey),
      blindRunId,
      answerRank: candidates.length + 1,
      categoryRank: claimedCategory === "unclear" ? null : currentCategoryCount + 1,
      claimedCategory,
      companyName: match.companyName,
      legalName: null,
      domain,
      officialWebsiteUrl: websiteUrl,
      countryCode: run.countryCode,
      claimedChannelClass: inferClaimedClass(excerpt),
      claimedCudyRelationship: inferCudyRelationship(excerpt),
      answerExcerpt: excerpt,
      sourceUrls,
      codexPreVerification: {
        companyExists: null,
        operatesInCountry: null,
        channelRelevant: null,
        evidenceSufficient: null,
        notes: ["Pending independent public-web verification."],
      },
      extractionRule: match.extractionRule,
      canonicalKey,
    };
    validateNormalizedCandidate(candidate);
    candidates.push(candidate);
    if (claimedCategory !== "unclear") categoryCounts.set(claimedCategory, currentCategoryCount + 1);
  }
  return candidates;
}

export function deduplicateOccurrences(occurrences: CandidateOccurrence[]): DeduplicatedCandidate[] {
  const grouped = new Map<string, CandidateOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = grouped.get(occurrence.canonicalKey) ?? [];
    list.push(occurrence);
    grouped.set(occurrence.canonicalKey, list);
  }
  return [...grouped.entries()]
    .map(([canonicalKey, items]) => ({
      blindCandidateId: items[0].blindCandidateId,
      canonicalKey,
      companyName: items[0].companyName,
      countryCode: items[0].countryCode,
      occurrenceCount: items.length,
      occurrences: items,
      mergedSourceUrls: [...new Set(items.flatMap((item) => item.sourceUrls))],
      mergedOfficialWebsiteUrls: [...new Set(items.flatMap((item) => item.officialWebsiteUrl ? [item.officialWebsiteUrl] : []))],
    }))
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount || left.blindCandidateId.localeCompare(right.blindCandidateId));
}

export function loadOrCreateBlindSalt(path: string): string {
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  mkdirSync(dirname(path), { recursive: true });
  const salt = randomBytes(32).toString("hex");
  writeFileSync(path, `${salt}\n`, { encoding: "utf8", mode: 0o600 });
  return salt;
}

export function answerDigest(answerText: string): string {
  return createHash("sha256").update(answerText).digest("hex");
}
