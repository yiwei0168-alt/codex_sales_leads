import {
  providerNeutralScoringEvidence,
  type BenchmarkLane,
  type SharedEvidenceDossier,
} from "./evidence-dossier";
import { assessEvidenceReliability } from "./v1.3-rescoring";

export interface V16ExtractedFacts {
  supportedRoles: string[];
  correctedRoutes: BenchmarkLane[];
  productFamilies: string[];
  comparableBrands: string[];
  businessActions: string[];
  explicitCudyTransaction: boolean;
  explicitComparableBrandPath: boolean;
  smbSohoUseCase: boolean;
  enterpriseOnlyContext: boolean;
  activeNetworking: boolean;
  evidenceItemCount: number;
  matchedEvidence: Array<{ url: string; supports: string[] }>;
}

export interface V16Levels {
  productUseCaseFit: number;
  cooperationPath: number;
  independentInformationConfidence: number;
}

export interface V16ScoreComponents {
  productUseCaseFit: number;
  cooperationPath: number;
  independentInformationConfidence: number;
  roleIdentificationQuality: number;
  channelClassificationQuality: number;
}

export interface V16UnifiedScore {
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  systemId: string;
  sourceChannelIds: BenchmarkLane[];
  channelId: BenchmarkLane;
  submittedRank: number;
  hardValueEligibility: {
    companyExists: boolean;
    germanyPresence: boolean;
    activeNetworking: boolean;
  };
  failedHardValueGates: Array<"companyExists" | "germanyPresence" | "activeNetworking">;
  facts: V16ExtractedFacts;
  levels: V16Levels;
  cooperationPathRoute: BenchmarkLane;
  scoreComponents: V16ScoreComponents;
  score: number;
  evaluationBasis: "v1.6-unified-frozen-provider-neutral-evidence";
  scoringReasons: {
    productUseCaseFit: string;
    cooperationPath: string;
    independentInformationConfidence: string;
  };
  priorV15: Array<{ channelId: BenchmarkLane; score: number; levels: V16Levels }>;
}

const routeOrder: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];
const roleRoutes: Array<{ route: BenchmarkLane; roles: string[] }> = [
  { route: "tier1-distribution", roles: ["Distributor", "VAD"] },
  { route: "b2b-resale", roles: ["VAR", "DVAR", "Dealer", "Reseller", "Retailer", "E-tailer"] },
  { route: "project-services", roles: ["SI", "Installer", "MSP", "ISP"] },
];

const familyPatterns: Array<[string, RegExp]> = [
  ["cellular-cpe", /\b(?:[45]g|lte|cellular|mobilfunk)\b.{0,80}\b(?:cpe|router|gateway|modem)s?\b|\b(?:cpe|router|gateway|modem)s?\b.{0,80}\b(?:[45]g|lte|cellular|mobilfunk)\b/i],
  ["wifi-access", /\b(?:wi-?fi|wlan|wireless|access[ -]?points?|mesh)\b/i],
  ["switching", /\b(?:ethernet|poe|managed|smart|network|netzwerk)?[- ]?switch(?:es)?\b|\bswitching\b/i],
  ["routing-gateway", /\b(?:router(?:s|n)?|gateways?|firewalls?|routing|sd-?wan)\b/i],
  ["wireless-bridge", /\b(?:wireless bridge|point[- ]to[- ]point|richtfunk|funkbr(?:u|ü)cke|outdoor wireless)s?\b/i],
];

const comparableBrands = [
  "TP-Link Omada", "Omada", "Ruijie", "Peplink", "Ubiquiti", "UniFi", "MikroTik", "D-Link",
  "Zyxel", "Aruba Instant On", "Grandstream", "EnGenius", "Cambium", "Ruckus", "Teltonika",
  "Extreme Networks", "Cisco",
] as const;

const brandPatterns = new Map<string, RegExp>([
  ["TP-Link Omada", /\btp[- ]?link\s+omada\b/i], ["Omada", /\bomada\b/i], ["Ruijie", /\bruijie\b/i],
  ["Peplink", /\bpeplink\b/i], ["Ubiquiti", /\bubiquiti\b/i], ["UniFi", /\buni-?fi\b/i],
  ["MikroTik", /\bmikrotik\b/i], ["D-Link", /\bd[- ]link\b/i], ["Zyxel", /\bzyxel\b/i],
  ["Aruba Instant On", /\baruba(?:\s+instant\s+on)?\b/i], ["Grandstream", /\bgrandstream\b/i],
  ["EnGenius", /\bengenius\b/i], ["Cambium", /\bcambium\b/i], ["Ruckus", /\bruckus\b/i],
  ["Teltonika", /\bteltonika\b/i],
  ["Extreme Networks", /\bextreme(?:\s+networks)?\b/i], ["Cisco", /\bcisco\b/i],
]);

const rolePatterns: Array<[string, RegExp]> = [
  ["VAD", /\b(?:value[- ]?add(?:ed)?\s+(?:distribut(?:or|ion)|partner)|value[- ]?added\s+distribut(?:or|ion)|VAD)\b/i],
  ["Distributor", /\b(?:it[- ]?distribut(?:or|ion)|distribut(?:or|ion)\s+(?:f(?:u|ü)r|of)|distributor\s+for|grossist(?:en)?|gro(?:ß|ss)handel|fachhandel\s+von|f(?:u|ü)r\s+den\s+fachhandel)\b/i],
  ["DVAR", /\b(?:direct\s+value[- ]?added\s+reseller|DVAR)\b/i],
  ["VAR", /\b(?:value[- ]?add(?:ed)?\s+resell(?:er|ing)|value[- ]?resell(?:er|ing)|systemhaus|system house|VAR)\b/i],
  ["E-tailer", /\b(?:online[- ]?shop|onlineshop|web[- ]?shop|e[- ]?tailer|online[- ]?h(?:a|ä)ndler)\b/i],
  ["Retailer", /\b(?:retail(?:er)?|ladengesch(?:a|ä)ft|filiale|store)\b/i],
  ["Dealer", /\b(?:fachh(?:a|ä)ndler|dealer)\b/i],
  ["Reseller", /\b(?:resell(?:er|ing)|wiederverk(?:a|ä)ufer|handel\s+mit|it[- ]?shop|fachshop)\b/i],
  ["SI", /\b(?:systemintegrat(?:or|ion)|it[- ]?integrat(?:or|ion)|netzwerk[- ]?integrat(?:or|ion)|integration\s+von|konzipier\w*|implementier\w*|realisier\w*)\b/i],
  ["Installer", /\b(?:installation|installier\w*|installations?service|montage|inbetriebnahme|implementier\w*|realisier\w*)\b/i],
  ["MSP", /\b(?:managed\s+service\s+provider|managed\s+(?:network|wlan|wi-?fi|it)[- ]?services?|MSP)\b/i],
  ["ISP", /\b(?:internet\s+service\s+provider|internetprovider|breitbandanbieter|ISP)\b/i],
];

const actionPatterns: Array<[string, RegExp]> = [
  ["distribution", /\b(?:distribut(?:or|ion)|grossist|gro(?:ß|ss)handel|fachhandel)\b/i],
  ["resale-or-shop", /\b(?:resell|wiederverk|online[- ]?shop|onlineshop|web[- ]?shop|it[- ]?shop|fachshop|warenkorb|bestellbar|auf lager|preis)\b/i],
  ["procurement", /\b(?:procure(?:ment)?|beschaffung|einkauf|bezug|liefern|lieferung|delivery)\b/i],
  ["selection-or-advice", /\b(?:auswahl|ausw(?:a|ä)hl\w*|empfehl\w*|berat\w*|consult(?:ing|ation)|produktwahl|ger(?:a|ä)tewahl|solution selection)\b/i],
  ["planning", /\b(?:plan\w*|projektier\w*|design|architecture|architektur|konzipier\w*)\b/i],
  ["implementation", /\b(?:implementier\w*|realisier\w*|integrier\w*|integration|inbetriebnahme|deployment|rollout)\b/i],
  ["installation", /\b(?:installation|installier\w*|montage|monteur)\b/i],
  ["operations-or-support", /\b(?:betrieb|betreib\w*|verwaltung|managed|wart\w*|maintenance|support|training|schulung)\b/i],
  ["channel-support", /\b(?:systemh(?:a|ä)user|reseller|dealer|fachhandel|channel|partnernetz|partner network)\b/i],
];

const cudyTransactionPattern = /\bcudy\b.{0,140}\b(?:in stock|available|add to cart|buy|order|price|sku|listed|sells?|resells?|auf lager|bestellbar|preis|warenkorb|verkauft|vertreibt)\b|\b(?:in stock|available|add to cart|buy|order|price|sku|listed|sells?|resells?|auf lager|bestellbar|preis|warenkorb|verkauft|vertreibt)\b.{0,140}\bcudy\b/i;
const partnerWordPattern = /\b(?:partner|distribut(?:or|ion)|authorized|official|vertreibt|distribuiert|resell(?:er|ing)|h(?:a|ä)ndler)\b/i;
const smbPattern = /\b(?:small business|smb|soho|home office|mittelstand|mittelst(?:a|ä)ndisch|hotel|hospitality|restaurant|gastronomie|retail branch|branch office|ferienwohnung|kleinunternehmen)\b/i;
const enterprisePattern = /\b(?:data cent(?:er|re)|rechenzentrum|carrier[- ]?grade|telecom core|campus fabric|hyperscale|large enterprise|gro(?:ß|ss)unternehmen|public infrastructure)\b/i;
const highEndOnlyPattern = /\b(?:arista|cisco nexus|carrier[- ]?grade|telecom core|campus fabric|hyperscale)\b/i;
const networkingDistributionPattern = /\b(?:it|ict|itk|network|networking|netzwerk)[- ]?distribut\w*\b|\bdistribut\w*\b.{0,160}\b(?:network|networking|netzwerk|wlan|wi-?fi|access[ -]?point|switch|router|omada|ruijie|ubiquiti|mikrotik|d[- ]link|zyxel|cambium|ruckus|teltonika)\b|\b(?:network|networking|netzwerk|wlan|wi-?fi|access[ -]?point|switch|router|omada|ruijie|ubiquiti|mikrotik|d[- ]link|zyxel|cambium|ruckus|teltonika)\b.{0,160}\bdistribut\w*\b/i;

function routesForRoles(roles: string[]): BenchmarkLane[] {
  return roleRoutes.filter((entry) => entry.roles.some((role) => roles.includes(role))).map((entry) => entry.route);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function extractMatches(text: string, patterns: Array<[string, RegExp]>): string[] {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function extractV16Facts(dossier: SharedEvidenceDossier): V16ExtractedFacts {
  const evidence = providerNeutralScoringEvidence(dossier);
  const text = evidence.map((item) => item.excerpt).join("\n");
  const productFamilies = extractMatches(text, familyPatterns);
  const supportedRoles = extractMatches(text, rolePatterns)
    .filter((role) => role !== "Distributor" || networkingDistributionPattern.test(text));
  const brands = comparableBrands.filter((brand) => brandPatterns.get(brand)?.test(text));
  const businessActions = extractMatches(text, actionPatterns);
  const explicitComparableBrandPath = brands.some((brand) => {
    const pattern = brandPatterns.get(brand);
    if (!pattern) return false;
    return evidence.some((item) => pattern.test(item.excerpt) && partnerWordPattern.test(item.excerpt));
  });
  const matchedEvidence = evidence.map((item) => {
    const supports: string[] = [];
    if (familyPatterns.some(([, pattern]) => pattern.test(item.excerpt))) supports.push("product-family");
    if (rolePatterns.some(([, pattern]) => pattern.test(item.excerpt))) supports.push("role");
    if (actionPatterns.some(([, pattern]) => pattern.test(item.excerpt))) supports.push("business-action");
    if (comparableBrands.some((brand) => brandPatterns.get(brand)?.test(item.excerpt))) supports.push("comparable-brand");
    if (cudyTransactionPattern.test(item.excerpt)) supports.push("cudy-transaction");
    return { url: item.url, supports };
  }).filter((item) => item.supports.length > 0);
  const explicitCudyTransaction = cudyTransactionPattern.test(text);
  const smbSohoUseCase = smbPattern.test(text);
  const enterpriseOnlyContext = !smbSohoUseCase && (highEndOnlyPattern.test(text)
    || (enterprisePattern.test(text) && productFamilies.length < 3));
  return {
    supportedRoles,
    correctedRoutes: routesForRoles(supportedRoles),
    productFamilies,
    comparableBrands: brands,
    businessActions,
    explicitCudyTransaction,
    explicitComparableBrandPath,
    smbSohoUseCase,
    enterpriseOnlyContext,
    activeNetworking: dossier.claimCoverage.activeNetworking || productFamilies.length > 0,
    evidenceItemCount: evidence.length,
    matchedEvidence,
  };
}

export function assessV16ProductFit(facts: V16ExtractedFacts): { level: number; reason: string } {
  const familyCount = facts.productFamilies.length;
  if (facts.explicitCudyTransaction) return { level: 5, reason: "A live Cudy transaction/listing proves direct product fit." };
  if (facts.explicitComparableBrandPath && facts.supportedRoles.some((role) => ["Distributor", "VAD", "VAR", "DVAR", "Dealer", "Reseller"].includes(role))) {
    return { level: 5, reason: "An explicit comparable-brand path is tied to a proven distribution or resale role." };
  }
  if (facts.enterpriseOnlyContext) {
    if (familyCount >= 3 && facts.explicitComparableBrandPath) {
      return { level: 3, reason: "Broad networking and a comparable-brand path are proven, with a limited deduction for exclusively enterprise/data-centre context." };
    }
    if (familyCount > 0) return { level: 2, reason: "Relevant networking families are proven, but the visible context is exclusively enterprise/data-centre oriented." };
  }
  if (familyCount >= 2 && facts.explicitComparableBrandPath) {
    return { level: 5, reason: "Multiple Cudy-relevant product families and an explicit comparable-brand commercial path are proven." };
  }
  if (familyCount >= 3 && facts.smbSohoUseCase) return { level: 5, reason: "Broad Cudy-relevant product coverage in an SMB/SOHO use case is proven." };
  if (familyCount >= 2) return { level: 4, reason: "At least two Cudy-relevant active-networking product families are proven." };
  if (familyCount === 1 && (facts.businessActions.includes("implementation") || facts.businessActions.includes("installation")
    || facts.businessActions.includes("resale-or-shop") || facts.businessActions.includes("distribution"))) {
    return { level: 3, reason: "One core Cudy-relevant family is tied to a concrete commercial or implementation action." };
  }
  if (familyCount === 1) return { level: 2, reason: "One relevant networking family is visible without a strong commercial/use-case signal." };
  if (facts.activeNetworking) return { level: 1, reason: "Active networking is supported, but no Cudy-relevant product family was extracted." };
  return { level: 0, reason: "No active-networking fit is supported." };
}

export function assessV16CooperationPath(channelId: BenchmarkLane, facts: V16ExtractedFacts): { level: number; reason: string } {
  const actions = new Set(facts.businessActions);
  if (facts.explicitCudyTransaction) return { level: 5, reason: "An existing Cudy transaction proves a working cooperation path." };
  if (channelId === "tier1-distribution") {
    if (facts.supportedRoles.includes("Distributor") || facts.supportedRoles.includes("VAD")) {
      if (facts.explicitComparableBrandPath || actions.has("channel-support")) {
        return { level: 5, reason: "Distribution plus a comparable-brand or downstream-channel path is explicit." };
      }
      return { level: 4, reason: "An explicit distribution/VAD business establishes a credible direct-brand path." };
    }
  }
  if (channelId === "b2b-resale") {
    if (facts.explicitComparableBrandPath && (actions.has("resale-or-shop") || facts.supportedRoles.includes("VAR"))) {
      return { level: 5, reason: "Comparable-brand resale and a transaction/VAR route are explicit." };
    }
    if (actions.has("resale-or-shop") || facts.supportedRoles.some((role) => ["VAR", "DVAR", "Dealer", "Reseller", "E-tailer"].includes(role))) {
      return { level: 4, reason: "A concrete resale, shop or VAR route is explicit." };
    }
    if (actions.has("procurement") || actions.has("selection-or-advice")) {
      return { level: 3, reason: "Procurement or product-selection influence is explicit, without a proven resale transaction." };
    }
  }
  if (channelId === "project-services") {
    const controlActions = ["procurement", "selection-or-advice", "planning", "implementation", "installation"]
      .filter((action) => actions.has(action));
    if ((actions.has("procurement") || actions.has("selection-or-advice")) && controlActions.length >= 2) {
      return { level: 5, reason: "Selection/procurement influence plus another delivery action proves strong product control." };
    }
    if (controlActions.length >= 2) return { level: 4, reason: "At least two project-control or delivery actions are explicit." };
    if (controlActions.length === 1) return { level: 3, reason: "One concrete planning, selection, procurement, implementation or installation action is explicit." };
    if (facts.supportedRoles.some((role) => ["SI", "Installer", "MSP", "ISP"].includes(role))) {
      return { level: 2, reason: "A project-service role is supported, but product control is not explicit." };
    }
  }
  return facts.activeNetworking
    ? { level: 1, reason: "Networking relevance is present without a route-specific buying or influence path." }
    : { level: 0, reason: "No cooperation path is supported." };
}

export function evaluateV16Candidate(options: {
  dossier: SharedEvidenceDossier;
  systemId: string;
  channelId: BenchmarkLane;
  sourceChannelIds: BenchmarkLane[];
  submittedRank: number;
  priorV15?: V16UnifiedScore["priorV15"];
  hardValueOverride?: V16UnifiedScore["hardValueEligibility"];
}): V16UnifiedScore {
  const { dossier, systemId, channelId, sourceChannelIds, submittedRank } = options;
  const facts = extractV16Facts(dossier);
  const product = assessV16ProductFit(facts);
  const cooperation = assessV16CooperationPath(channelId, facts);
  const reliability = assessEvidenceReliability(dossier);
  const levels: V16Levels = {
    productUseCaseFit: product.level,
    cooperationPath: cooperation.level,
    independentInformationConfidence: reliability.level,
  };
  const hardValueEligibility = options.hardValueOverride ?? {
    companyExists: dossier.claimCoverage.identity,
    germanyPresence: dossier.claimCoverage.germanyPresence,
    activeNetworking: facts.activeNetworking,
  };
  const failedHardValueGates = (Object.entries(hardValueEligibility) as Array<[
    keyof typeof hardValueEligibility, boolean,
  ]>).filter(([, passed]) => !passed).map(([gate]) => gate);
  const roleIdentificationQuality = facts.supportedRoles.length > 0 ? 3 : 0;
  const channelClassificationQuality = facts.correctedRoutes.includes(channelId) ? 1 : 0;
  const scoreComponents: V16ScoreComponents = {
    productUseCaseFit: round(levels.productUseCaseFit * 8.8),
    cooperationPath: round(levels.cooperationPath * 6.4),
    independentInformationConfidence: round(levels.independentInformationConfidence * 4),
    roleIdentificationQuality,
    channelClassificationQuality,
  };
  const score = failedHardValueGates.length > 0 ? 0
    : round(Object.values(scoreComponents).reduce((sum, value) => sum + value, 0));
  return {
    dossierId: dossier.dossierId,
    companyName: dossier.canonicalName,
    officialUrl: dossier.canonicalOfficialUrl,
    systemId,
    sourceChannelIds,
    channelId,
    submittedRank,
    hardValueEligibility,
    failedHardValueGates,
    facts,
    levels,
    cooperationPathRoute: channelId,
    scoreComponents,
    score,
    evaluationBasis: "v1.6-unified-frozen-provider-neutral-evidence",
    scoringReasons: {
      productUseCaseFit: product.reason,
      cooperationPath: `${channelId}: ${cooperation.reason}`,
      independentInformationConfidence: reliability.reason,
    },
    priorV15: options.priorV15 ?? [],
  };
}

export function targetRoutesForV16(facts: V16ExtractedFacts, submittedRoutes: BenchmarkLane[]): BenchmarkLane[] {
  const routes = facts.correctedRoutes.length > 0 ? facts.correctedRoutes : [...new Set(submittedRoutes)];
  return routeOrder.filter((route) => routes.includes(route));
}
