export type CooperationLane = "tier1-distribution" | "b2b-resale" | "project-services" | "operator";

export type CooperationSignal =
  | "brand-direct"
  | "downstream-supply"
  | "listing-ordering"
  | "quotation"
  | "specification-selection"
  | "procurement"
  | "deployment"
  | "managed-operation"
  | "active-transaction"
  | "active-cudy-transaction"
  | "customer-supplied-installation";

export interface CooperationPathAssessment {
  lane: CooperationLane;
  cap: 2 | 3 | 4 | 5;
  signals: CooperationSignal[];
  demonstratedLevers: number;
  completeRepeatablePath: boolean;
  reason: string;
}

export const COOPERATION_PATH_POLICY = {
  version: "evidence-capped-cooperation-path-v1",
  noControlCap: 2,
  oneLeverCap: 3,
  multipleLeverCap: 4,
  verifiedActiveOrCompletePathCap: 5,
  measuredLevers: ["procurement", "listing/ordering", "quotation", "specification/selection", "BOM", "brand recommendation", "deployment"],
  laneRules: {
    tier1: "Look for brand onboarding/direct procurement/import plus repeatable downstream reseller supply.",
    b2bResale: "Look for purchasing, live product listing/ordering, quotation and recommendation control.",
    projectServices: "Look for design/specification/BOM, procurement/vendor selection and deployment responsibility.",
  },
  installerBoundary: "An Installer explicitly limited to customer-supplied equipment is capped at level 2.",
  levelFiveRule: "Level 5 requires an evidenced active transaction/listing/direct-procurement path or a complete repeatable cooperation chain. A public Cudy listing proves a live path; the relationship label alone adds no points.",
  unknownRule: "Missing public procurement or control evidence remains unknown, not a factual negative, but cannot support a higher cooperation-path level.",
  scaleRule: "Company size does not increase the cooperation-path score.",
} as const;

const patterns: Array<{ signal: CooperationSignal; pattern: RegExp }> = [
  {
    signal: "brand-direct",
    pattern: /\b(?:authorized|official|value[- ]added|speciali[sz]ed?)\b.{0,35}\bdistribut(?:or|ion)\b|\bdirect(?:ly)?\s+(?:procures?|purchases?|buys?)\s+from\s+(?:brands?|manufacturers?|vendors?)\b|\b(?:brand|vendor)\s+onboarding\b|\b(?:importer|importiert|direktbezug|herstellerbezug)\b/i,
  },
  {
    signal: "downstream-supply",
    pattern: /\b(?:suppl(?:y|ies)|sell(?:s|ing)?|deliver(?:s|ing)?|beliefert|versorgt)\b.{0,60}\b(?:resellers?|dealers?|channel partners?|system integrators?|fachh(?:a|ä)ndler|wiederverk(?:a|ä)ufer)\b|\b(?:reseller|dealer|trade|partner)\s+(?:portal|account|program(?:me)?|network)\b|\bwholesale(?:r)?\b/i,
  },
  {
    signal: "listing-ordering",
    pattern: /\b(?:product (?:listing|catalog(?:ue)?|page)|online shop|webshop|shop online|order online|bestellen|onlineshop|produktkatalog|warenkorb)\b|\b(?:lists?|sell(?:s|ing)?|resell(?:s|ing)?|offers?|verkauft|vertreibt|bietet)\b.{0,50}\b(?:routers?|gateways?|access points?|wlan|wi-?fi|poe switches?|network hardware|netzwerk(?:hardware|ger(?:a|ä)te))\b/i,
  },
  {
    signal: "quotation",
    pattern: /\b(?:request (?:a )?quote|quotation|quoted?|commercial offer|angebot anfordern|angebotsanfrage|individuelles angebot|b2b quote)\b/i,
  },
  {
    signal: "specification-selection",
    pattern: /\b(?:specif(?:y|ies|ication)|product selection|vendor selection|brand selection|bill of materials|\bBOM\b|recommend(?:s|ation)?|network design|solution design|fachplanung|produktauswahl|herstellerauswahl|ausschreibung|st(?:u|ü)ckliste|netzwerkplanung)\b/i,
  },
  {
    signal: "procurement",
    pattern: /\b(?:procures?|procurement|purchases?|purchasing|sources?|sourcing|beschafft|beschaffung|einkauf|bezieht)\b.{0,60}\b(?:hardware|equipment|products?|devices?|routers?|switches?|access points?|netzwerk|ger(?:a|ä)te|produkte)\b/i,
  },
  {
    signal: "deployment",
    pattern: /\b(?:deploy(?:s|ment)?|install(?:s|ation)?|implement(?:s|ation)?|configur(?:e|es|ation)|rollout|inbetriebnahme|installiert|implementiert|konfiguriert)\b.{0,60}\b(?:network|wlan|wi-?fi|lan|routers?|switches?|access points?|netzwerk|ger(?:a|ä)te)\b/i,
  },
  {
    signal: "managed-operation",
    pattern: /\b(?:operates?|operation|maintains?|maintenance|managed wi-?fi|managed network|betreibt|betrieb|wartet|wartung|netzwerkbetrieb)\b.{0,60}\b(?:network|wlan|wi-?fi|lan|infrastructure|netzwerk|access points?)\b/i,
  },
  {
    signal: "active-transaction",
    pattern: /\b(?:in stock|available now|add to cart|buy now|unit price|sku|article no\.?|artikelnummer|sofort lieferbar|auf lager|preis(?: inkl\.?| exkl\.?|:)|bestellbar)\b/i,
  },
  {
    signal: "active-cudy-transaction",
    pattern: /\bcudy\b.{0,80}\b(?:in stock|available|add to cart|buy|order|price|sku|listed|sells?|resells?|auf lager|bestellbar|preis|verkauft|vertreibt)\b|\b(?:in stock|available|add to cart|buy|order|price|sku|listed|sells?|resells?|auf lager|bestellbar|preis|verkauft|vertreibt)\b.{0,80}\bcudy\b/i,
  },
  {
    signal: "customer-supplied-installation",
    pattern: /\b(?:customer|client)[- ]supplied (?:equipment|hardware|devices?)\b|\binstall(?:ation|s)? only\b|\b(?:vom kunden|kundenseitig) (?:bereitgestellte|gelieferte) (?:ger(?:a|ä)te|hardware)\b/i,
  },
];

const leverSignals = new Set<CooperationSignal>([
  "brand-direct", "downstream-supply", "listing-ordering", "quotation",
  "specification-selection", "procurement", "deployment", "managed-operation",
]);

function uniqueSignals(text: string): CooperationSignal[] {
  return [...new Set(patterns.filter(({ pattern }) => pattern.test(text)).map(({ signal }) => signal))];
}

function has(signals: CooperationSignal[], ...values: CooperationSignal[]): boolean {
  return values.every((value) => signals.includes(value));
}

export function assessCooperationPathEvidence(options: {
  lane: CooperationLane;
  evidence: Array<string | null | undefined>;
}): CooperationPathAssessment {
  const text = options.evidence.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n");
  const signals = uniqueSignals(text);
  const demonstratedLevers = signals.filter((signal) => leverSignals.has(signal)).length;
  const customerSuppliedInstaller = options.lane === "project-services" && signals.includes("customer-supplied-installation");
  const laneComplete = options.lane === "tier1-distribution"
    ? has(signals, "brand-direct", "downstream-supply")
    : options.lane === "b2b-resale"
      ? signals.includes("active-transaction") && signals.includes("listing-ordering")
      : options.lane === "project-services"
        ? has(signals, "specification-selection", "procurement", "deployment")
        : has(signals, "procurement", "deployment") || has(signals, "procurement", "managed-operation");
  const completeRepeatablePath = signals.includes("active-cudy-transaction") || laneComplete;

  let cap: CooperationPathAssessment["cap"];
  if (customerSuppliedInstaller) cap = 2;
  else if (completeRepeatablePath) cap = 5;
  else if (demonstratedLevers >= 2) cap = 4;
  else if (demonstratedLevers === 1) cap = 3;
  else cap = 2;

  const reason = customerSuppliedInstaller
    ? "Evidence limits the Installer to customer-supplied equipment, so cooperation path is capped at level 2."
    : completeRepeatablePath
      ? "Evidence demonstrates an active transaction or a complete repeatable cooperation path."
      : demonstratedLevers >= 2
        ? `Evidence demonstrates ${demonstratedLevers} complementary cooperation levers, capped at level 4 without an active or complete path.`
        : demonstratedLevers === 1
          ? "Evidence demonstrates one cooperation lever, capped at level 3."
          : "No procurement, listing, quotation, specification, recommendation or deployment control was demonstrated; unknown evidence cannot support a score above level 2.";

  return { lane: options.lane, cap, signals, demonstratedLevers, completeRepeatablePath, reason };
}
