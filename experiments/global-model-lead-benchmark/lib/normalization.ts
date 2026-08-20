import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  deterministicBlindId,
  validateNormalizedCandidate,
  type NormalizedCandidate,
  type NormalizedContact,
} from "./judging";

export type MeasuredRun = {
  providerId: string;
  modelId: string;
  countryCode: string;
  repetition: number;
  scoringEligibility: string;
  nativeSearchEvidence: string;
  answerText: string;
};

export type CandidateOccurrence = NormalizedCandidate & {
  extractionRule: "numbered_heading" | "numbered_table_row" | "bold_candidate";
  canonicalKey: string;
  claimedEmails: string[];
  claimedPhones: string[];
};

export type DeduplicatedCandidate = {
  blindCandidateId: string;
  canonicalKey: string;
  companyName: string;
  countryCode: string;
  occurrenceCount: number;
  occurrences: CandidateOccurrence[];
  mergedSourceUrls: string[];
  mergedClaimedEmails: string[];
  mergedClaimedPhones: string[];
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
  /^(?:已证实|已證實|尚无|尚無|cudy technology|在德国|在德國|接触方式|接觸方式|下一步)/i,
  /(?:潜在渠道|跟进建议|检索局限|销售行动|证据来源|contact information|follow-up recommendations)$/i,
];

const LEGAL_SUFFIXES = /\b(?:gmbh|mbh|ag|se|ohg|kg|gbr|ug|e\.?\s*k\.?|inc|corp(?:oration)?|limited|ltd|llc|a\.?s\.?|sp\.?\s*z\.?\s*o\.?o\.?)\b/gi;
const NON_COMPANY_BOLD = /^(?:website|webseite|官网|網站|业务|業務|渠道角色|為什麼|为什么|来源|來源|公开|公開|kontakt|contact|evidence|quellen|empfehlung|注意)/i;

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
  const numberedHeading = /^#{2,6}\s+\d+[.)]\s+(.+)$/gmu;
  const numberedTableRow = /^\|\s*\d+\s*\|\s*([^|]+)\|.*$/gmu;
  const boldBullet = /^\s*-\s+\*\*([^*]+)\*\*(?:\s*\([^\n]*\))?/gmu;
  const boldLead = /^\*\*(?:\d+[.)]\s*)?([^*]+)\*\*\s*(?:\([^\n)]*\)\s*)?(?:[–—-]|$)/gmu;

  for (const [regex, extractionRule, target] of [
    [numberedHeading, "numbered_heading", headings],
    [numberedTableRow, "numbered_table_row", tableRows],
    [boldBullet, "bold_candidate", boldEntries],
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

  const selected = headings.length > 0 ? headings : tableRows.length > 0 ? tableRows : boldEntries;
  return selected
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((match, index, ordered) => index === 0 || match.start !== ordered[index - 1].start);
}

export function isDegenerateProcessOutput(answerText: string): boolean {
  const compact = answerText.replace(/\s+/g, "").toLowerCase();
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

function inferCudyRelationship(excerpt: string): NormalizedCandidate["claimedCudyRelationship"] {
  if (/(?:keine öffentliche cudy|尚无\s*cudy|尚無\s*cudy|未.*cudy.*证据|without.*cudy.*evidence|no.*cudy.*evidence)/iu.test(excerpt)) return "not_confirmed";
  if (/(?:cudy.{0,100}(?:产品|產品|product|sortiment|销售|銷售|在售|listet|verkauft|distribut)|(?:产品|產品|product|销售|銷售|在售|listet|verkauft|distribut).{0,100}cudy)/iu.test(excerpt)) return "confirmed";
  return "unclear";
}

function extractEmails(text: string): string[] {
  return [...new Set((text.match(/(?<![\p{L}0-9._%+-])[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/giu) ?? []).map((value) => value.toLowerCase()))];
}

function extractPhones(text: string): string[] {
  const withoutUrls = text.replace(/https?:\/\/\S+/giu, " ");
  const candidates = withoutUrls.match(/(?:\+\d{1,3}|0\d{2,5})[\s()./-]+(?:\d[\s()./-]*){5,}/g) ?? [];
  return [...new Set(candidates.map((value) => value.trim()).filter((value) => value.replace(/\D/g, "").length >= 7))];
}

function contactClaims(excerpt: string, urls: string[]): NormalizedContact[] {
  const evidenceUrls = urls;
  const contacts: NormalizedContact[] = [];
  for (const email of extractEmails(excerpt)) {
    contacts.push({
      fullName: null,
      jobTitle: null,
      publicBusinessEmail: email,
      publicBusinessPhone: null,
      publicProfileUrl: null,
      evidenceUrls,
      answerExcerpt: email,
    });
  }
  for (const phone of extractPhones(excerpt)) {
    contacts.push({
      fullName: null,
      jobTitle: null,
      publicBusinessEmail: null,
      publicBusinessPhone: phone,
      publicProfileUrl: null,
      evidenceUrls,
      answerExcerpt: phone,
    });
  }
  return contacts;
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

  for (let index = 0; index < matches.length && candidates.length < 20; index += 1) {
    const match = matches[index];
    const excerpt = run.answerText.slice(match.start, excerptEnd(run.answerText, match, matches[index + 1])).trim();
    const sourceUrls = extractUrls(excerpt);
    const domain = candidateDomain(match.companyName, sourceUrls);
    const nameKey = normalizedNameKey(match.companyName);
    const canonicalKey = domain ? `domain:${domain}` : `name:${nameKey}:${run.countryCode}`;
    if (seen.has(canonicalKey) || seenNames.has(nameKey)) continue;
    seen.add(canonicalKey);
    seenNames.add(nameKey);
    const contacts = contactClaims(excerpt, sourceUrls);
    const candidate: CandidateOccurrence = {
      blindCandidateId: deterministicBlindId("C", secretSalt, canonicalKey),
      blindRunId,
      answerRank: candidates.length + 1,
      companyName: match.companyName,
      legalName: null,
      domain,
      countryCode: run.countryCode,
      claimedChannelClass: inferClaimedClass(excerpt),
      claimedCudyRelationship: inferCudyRelationship(excerpt),
      answerExcerpt: excerpt,
      sourceUrls,
      contacts,
      codexPreVerification: {
        companyExists: null,
        operatesInCountry: null,
        channelRelevant: null,
        evidenceSufficient: null,
        notes: ["Pending independent public-web verification."],
      },
      extractionRule: match.extractionRule,
      canonicalKey,
      claimedEmails: extractEmails(excerpt),
      claimedPhones: extractPhones(excerpt),
    };
    validateNormalizedCandidate(candidate);
    candidates.push(candidate);
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
      mergedClaimedEmails: [...new Set(items.flatMap((item) => item.claimedEmails))],
      mergedClaimedPhones: [...new Set(items.flatMap((item) => item.claimedPhones))],
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
