import { assessChannelMembershipEvidence, type ChannelMembershipLane } from "../../../src/lib/leads/channel-membership";
import { assessCooperationPathEvidence } from "../../../src/lib/leads/cooperation-path";
import { assessLeadEvidenceQuality } from "../../../src/lib/leads/evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../../../src/lib/leads/networking-relevance";
import {
  providerNeutralScoringEvidence,
  type BenchmarkLane,
  type SharedEvidenceDossier,
} from "./evidence-dossier";

export interface V13Eligibility {
  companyExists: boolean;
  germanyPresence: boolean;
  activeNetworking: boolean;
  submittedLaneMembership: boolean;
  sufficientEvidence: boolean;
  uniqueCanonicalCompany: boolean;
}

export interface V13Levels {
  productUseCaseFit: number;
  cooperationPath: number;
  evidenceReliability: number;
}

export interface V13OccurrenceScore {
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  systemId: string;
  channelId: BenchmarkLane;
  submittedRank: number;
  supportedRoles: string[];
  eligibility: V13Eligibility;
  failedGates: Array<keyof V13Eligibility>;
  levels: V13Levels;
  score: number;
  evidenceProfile: string;
  assessments: {
    laneMembership: string;
    networking: string;
    productUseCaseFit: string;
    cooperationPath: string;
    evidenceReliability: string;
    evidenceSufficiency: string;
  };
  evidence: ReturnType<typeof providerNeutralScoringEvidence>;
}

function membershipLane(lane: BenchmarkLane): ChannelMembershipLane {
  if (lane === "tier1-distribution") return "distribution";
  if (lane === "b2b-resale") return "resale";
  return "services";
}

function hostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const familyPatterns = [
  /\b(?:[45]g|cellular|lte)\s+(?:cpe|routers?|gateways?|modems?)\b|\b(?:cpe|routers?|gateways?|modems?)\s+(?:with\s+)?(?:[45]g|lte|cellular)\b/i,
  /\b(?:wi-?fi|wlan|wireless)\s+(?:access points?|aps?|controllers?|routers?|mesh|hardware|equipment|l(?:o|ö)sungen?)\b|\b(?:access points?|mesh wi-?fi)\b/i,
  /\b(?:ethernet|poe|managed|smart|network|netzwerk)[- ]?switch(?:es)?\b|\b(?:managed )?switch(?:es)?\b/i,
  /\b(?:network|routing|security)\s+gateways?\b|\b(?:business|smb|soho)\s+routers?\b|\b(?:network )?firewalls?\b|\brouters?\b/i,
  /\b(?:outdoor wireless|wireless bridges?|point[- ]to[- ]point|richtfunk|funkbr(?:u|ü)cken?)\b/i,
] as const;

const directOverlapPattern = /\b(?:small business|smb|soho|home office|mittelstand|hotels?|hospitality|restaurants?|retail branch|branch office|ferienwohnung|gastronomie)\b/i;
const enterpriseOnlyPattern = /\b(?:data cent(?:er|re)|rechenzentrum|carrier[- ]grade|telecom core|campus (?:fabric|solutions?)|airports?|broadband networks?|network operators?|public infrastructure|cisco nexus|hyperscale|large enterprise)\b/i;
const activeCudyPattern = /\bcudy\b.{0,100}\b(?:in stock|available|add to cart|buy|order|price|sku|listed|sells?|resells?|auf lager|bestellbar|preis|verkauft|vertreibt)\b|\b(?:in stock|available|add to cart|buy|order|price|sku|listed|sells?|resells?|auf lager|bestellbar|preis|verkauft|vertreibt)\b.{0,100}\bcudy\b/i;
const explicitImplementationPattern = /\b(?:design\w*|plan\w*|deploy\w*|install\w*|implement\w*|maintain\w*|betrieb\w*|wart\w*|integrier\w*)\b.{0,80}\b(?:wi-?fi|wlan|lan\s+(?:network|infrastructure|solution)|access points?|poe switches?)\b|\b(?:wi-?fi|wlan|lan\s+(?:network|infrastructure|solution)|access points?|poe switches?)\b.{0,80}\b(?:design\w*|plan\w*|deploy\w*|install\w*|implement\w*|maintain\w*|betrieb\w*|wart\w*|integrier\w*)\b/i;
const managedWifiSpecialistPattern = /\b(?:plan\w*|install\w*|pfleg\w*|maintain\w*|managed)\b.{0,100}\b(?:guest wi-?fi|g(?:a|ä)ste[- ]?wlan|public wi-?fi|wlan)\b|\b(?:guest wi-?fi|g(?:a|ä)ste[- ]?wlan|public wi-?fi|wlan)\b.{0,100}\b(?:plan\w*|install\w*|pfleg\w*|maintain\w*|managed)\b/i;
const comparableBrandPattern = /\b(?:tp[- ]?link\s+omada|omada|ruijie|peplink|ubiquiti|uni-?fi|mikrotik|d[- ]link|zyxel|aruba instant on|grandstream|engenius)\b/i;
const comparableBrandPathPattern = /\b(?:partner|distribut(?:or|ion)|authorized|official|vertreibt|distribuiert)\b.{0,100}\b(?:tp[- ]?link\s+omada|omada|ruijie|peplink|ubiquiti|uni-?fi|mikrotik|d[- ]link|zyxel|aruba instant on|grandstream|engenius)\b|\b(?:tp[- ]?link\s+omada|omada|ruijie|peplink|ubiquiti|uni-?fi|mikrotik|d[- ]link|zyxel|aruba instant on|grandstream|engenius)\b.{0,100}\b(?:partner|distribut(?:or|ion)|authorized|official|vertreibt|distribuiert)\b/i;
const valueAddedDistributorPattern = /\b(?:value[- ]added distributor|value added distribution|\bVAD\b)\b/i;
const professionalNetworkShopPattern = /\b(?:fachshop|fachh(?:a|ä)ndler|online shop|onlineshop)\b.{0,100}\b(?:netzwerktechnik|networking|it-installationen)\b|\b(?:netzwerktechnik|networking|it-installationen)\b.{0,100}\b(?:fachshop|fachh(?:a|ä)ndler|online shop|onlineshop)\b/i;

export function assessProductUseCaseFit(excerpts: string[]): { level: number; reason: string; familyCount: number } {
  const text = excerpts.join("\n");
  const familyCount = familyPatterns.filter((pattern) => pattern.test(text)).length;
  if (activeCudyPattern.test(text)) {
    return { level: 5, familyCount, reason: "A live Cudy transaction/listing directly proves product and route fit." };
  }
  if (managedWifiSpecialistPattern.test(text) && directOverlapPattern.test(text)) {
    return { level: 5, familyCount, reason: "A specialist managed/guest-Wi-Fi lifecycle in Cudy-relevant hospitality or SMB settings is evidenced." };
  }
  if (comparableBrandPattern.test(text) && comparableBrandPathPattern.test(text) && familyCount >= 2) {
    return { level: 5, familyCount, reason: "Multiple relevant product families and an explicit partner/distribution path for a comparable networking brand are evidenced." };
  }
  if (valueAddedDistributorPattern.test(text) && enterpriseOnlyPattern.test(text) && !directOverlapPattern.test(text)) {
    return { level: 3, familyCount, reason: "A networking VAD has relevant product access, but its visible portfolio is mainly high-end enterprise infrastructure." };
  }
  const networking = assessNetworkingRelevanceEvidence(excerpts);
  if (valueAddedDistributorPattern.test(text) && networking.demonstrated) {
    return { level: 3, familyCount, reason: "A VAD with active-networking business is evidenced, but no closer SOHO/SMB product overlap is proven." };
  }
  if (networking.demonstrated && enterpriseOnlyPattern.test(text) && !directOverlapPattern.test(text)) {
    return { level: 2, familyCount, reason: "Active networking is evidenced, but the visible use case is mainly enterprise/carrier adjacent." };
  }
  if (familyCount >= 3) {
    return { level: 4, familyCount, reason: `${familyCount} relevant product families are evidenced without a direct Cudy or comparable-brand transaction.` };
  }
  if (familyCount >= 2) {
    return { level: 4, familyCount, reason: `${familyCount} directly relevant active-networking product families are evidenced.` };
  }
  if (professionalNetworkShopPattern.test(text)) {
    return { level: 3, familyCount, reason: "A specialist professional networking shop is evidenced, although current direct active-product overlap is limited." };
  }
  if (familyCount === 1 || explicitImplementationPattern.test(text)) {
    return { level: 3, familyCount, reason: "One core product family or an explicit WLAN/LAN implementation use case is evidenced." };
  }
  if (networking.demonstrated) {
    return { level: 1, familyCount, reason: "Only weak active-networking overlap is evidenced; no direct Cudy product family or use case was found." };
  }
  return { level: 0, familyCount, reason: "No active-networking product or implementation evidence was demonstrated." };
}

export function assessEvidenceReliability(dossier: SharedEvidenceDossier): { level: number; reason: string } {
  const evidence = providerNeutralScoringEvidence(dossier);
  if (evidence.length === 0) return { level: 0, reason: "No provider-neutral claim evidence was collected." };
  const officialHost = dossier.canonicalOfficialUrl ? hostname(dossier.canonicalOfficialUrl) : dossier.canonicalDomain;
  const officialOrigins = new Set<string>();
  const independentOrigins = new Set<string>();
  for (const item of evidence) {
    const itemHost = hostname(item.url);
    if (!itemHost) continue;
    const sameOfficial = Boolean(officialHost && (itemHost === officialHost || itemHost.endsWith(`.${officialHost}`)));
    if (item.sourceType === "official-company" || sameOfficial) officialOrigins.add(itemHost);
    else independentOrigins.add(itemHost);
  }
  const quality = assessLeadEvidenceQuality({
    candidateDomain: dossier.canonicalDomain,
    officialUrl: dossier.canonicalOfficialUrl,
    evidence,
  });
  const text = evidence.map((item) => item.excerpt).join("\n");
  const independentlyAuditableOfficialClaim = /\b(?:in stock|sofort lieferbar|bestellbar|lieferzeit|unit price|preis|warenkorb)\b/i.test(text)
    || /\b(?:value[- ]added distributor|distributor)\s+(?:of|von|f(?:u|ü)r)\s+(?:peplink|ruijie|ubiquiti|omada|mikrotik|d[- ]link|zyxel)\b/i.test(text);
  if (officialOrigins.size > 0 && independentOrigins.size >= 2) {
    return { level: 5, reason: "Company-owned evidence is corroborated by at least two independent public origins." };
  }
  if (officialOrigins.size > 0 && independentOrigins.size >= 1) {
    return { level: 4, reason: "Company-owned evidence is corroborated by an independent public origin." };
  }
  if (officialOrigins.size > 0 && independentlyAuditableOfficialClaim) {
    return { level: 4, reason: "Official evidence contains a live transaction or a specific, independently auditable comparable-brand distribution claim." };
  }
  if (officialOrigins.size > 0) {
    return { level: 3, reason: "Concrete company-owned evidence is available without independent corroboration." };
  }
  if (independentOrigins.size >= 3) {
    return { level: 4, reason: "At least three independent public origins corroborate the candidate." };
  }
  if (independentOrigins.size >= 2) {
    return { level: 3, reason: "Two independent public origins provide concrete support." };
  }
  return quality.sufficient
    ? { level: 2, reason: "One concrete public origin qualifies under the audited small-long-tail exception." }
    : { level: 1, reason: "Only one weak or identity-incomplete public origin is available." };
}

export function evaluateV13Occurrence(options: {
  dossier: SharedEvidenceDossier;
  occurrence: SharedEvidenceDossier["submittedOccurrences"][number];
}): V13OccurrenceScore {
  const { dossier, occurrence } = options;
  const evidence = providerNeutralScoringEvidence(dossier);
  const excerpts = evidence.map((item) => item.excerpt);
  const lane = assessChannelMembershipEvidence({ lane: membershipLane(occurrence.channelId), evidence: excerpts });
  const networking = assessNetworkingRelevanceEvidence(excerpts);
  const cooperation = assessCooperationPathEvidence({ lane: occurrence.channelId, evidence: excerpts });
  const productFit = assessProductUseCaseFit(excerpts);
  const reliability = assessEvidenceReliability(dossier);
  const evidenceQuality = assessLeadEvidenceQuality({
    candidateDomain: dossier.canonicalDomain,
    officialUrl: dossier.canonicalOfficialUrl,
    evidence,
  });
  const eligibility: V13Eligibility = {
    companyExists: dossier.claimCoverage.identity,
    germanyPresence: dossier.claimCoverage.germanyPresence,
    activeNetworking: networking.demonstrated,
    submittedLaneMembership: lane.demonstrated,
    sufficientEvidence: evidenceQuality.sufficient,
    uniqueCanonicalCompany: true,
  };
  const failedGates = (Object.entries(eligibility) as Array<[keyof V13Eligibility, boolean]>)
    .filter(([, passed]) => !passed).map(([gate]) => gate);
  const levels: V13Levels = {
    productUseCaseFit: productFit.level,
    cooperationPath: cooperation.cap,
    evidenceReliability: reliability.level,
  };
  const score = failedGates.length === 0
    ? levels.productUseCaseFit * 9 + levels.cooperationPath * 7 + levels.evidenceReliability * 4
    : 0;
  return {
    dossierId: dossier.dossierId,
    companyName: dossier.canonicalName,
    officialUrl: dossier.canonicalOfficialUrl,
    systemId: occurrence.systemId,
    channelId: occurrence.channelId,
    submittedRank: occurrence.rank,
    supportedRoles: lane.supportedRoles,
    eligibility,
    failedGates,
    levels,
    score,
    evidenceProfile: evidenceQuality.profile,
    assessments: {
      laneMembership: lane.reason,
      networking: networking.reason,
      productUseCaseFit: productFit.reason,
      cooperationPath: cooperation.reason,
      evidenceReliability: reliability.reason,
      evidenceSufficiency: evidenceQuality.reason,
    },
    evidence,
  };
}
