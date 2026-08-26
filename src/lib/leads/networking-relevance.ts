export type NetworkingRelevanceStatus = "demonstrated" | "not-demonstrated";

export interface NetworkingRelevanceAssessment {
  status: NetworkingRelevanceStatus;
  demonstrated: boolean;
  positiveSignals: string[];
  genericSignals: string[];
  reason: string;
}

export const ACTIVE_NETWORKING_RELEVANCE_POLICY = {
  version: "active-networking-relevance-v1",
  passRule: "Require explicit evidence that the company sells, distributes, specifies, buys, designs, installs, deploys, operates or maintains active networking hardware, or implements WLAN/LAN projects that directly require it.",
  activeEquipmentExamples: [
    "router or gateway", "4G/5G CPE", "wireless AP, mesh or WLAN controller",
    "Ethernet/PoE switch", "modem", "outdoor or point-to-point wireless",
    "network firewall, security gateway or network-management controller",
  ],
  acceptableEvidence: [
    "official product, catalog or listing", "explicit distribution or resale",
    "explicit WLAN/LAN design, specification, BOM, procurement, deployment or maintenance",
    "named relevant vendor relationship", "concrete relevant project",
  ],
  insufficientAlone: [
    "IT infrastructure", "cloud connectivity", "edge infrastructure", "digital transformation",
    "managed IT", "IP solutions", "system integration", "network consulting", "data center",
    "broadcast IP", "IT procurement", "structured cabling, fiber or low-voltage work",
  ],
  boundary: "A pure cabling company may be a valid Installer but fails this Cudy networking-relevance gate without active-equipment evidence. Record missing public proof as not demonstrated, not as confirmed factual irrelevance.",
  separateDimension: "After the gate passes, score product/use-case fit separately; enterprise-only active networking can pass the gate but still have low Cudy fit.",
} as const;

const positivePatterns: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "active-networking product",
    pattern: /\b(?:routers?|routing gateways?|network gateways?|4g\s*(?:\/|and|-)?\s*5g\s+cpe|[45]g\s+cpe|cellular cpe|customer premises equipment|modems?|outdoor wireless|wireless bridges?|point[- ]to[- ]point wireless|richtfunk|funkbr(?:u|ü)cken?)\b/i,
  },
  {
    label: "Wi-Fi or WLAN equipment",
    pattern: /\b(?:wi-?fi\s*[5-7]?|wlan)\s+(?:access points?|aps?|controllers?|gateways?|routers?|mesh|hardware|equipment|ger(?:a|ä)te|l(?:o|ö)sungen?)\b|\b(?:wireless access points?|wlan controllers?|mesh wi-?fi)\b/i,
  },
  {
    label: "Ethernet or PoE switching",
    pattern: /\b(?:ethernet|poe|network|managed|smart|small business)\s+switch(?:es)?\b|\bswitch(?:es)?\s+(?:with\s+)?(?:ethernet|poe)\b|\b(?:netzwerk|poe)[- ]?switch(?:es)?\b/i,
  },
  {
    label: "active-networking hardware",
    pattern: /\b(?:active networking|network(?:ing)? hardware|network(?:ing)? equipment|network devices?|network firewalls?|security gateways?|unified threat management|network management controllers?|netzwerkhardware|netzwerkger(?:a|ä)te|aktive netzwerkkomponenten|netzwerk-firewalls?)\b/i,
  },
  {
    label: "named networking vendor or platform",
    pattern: /\b(?:tp[- ]?link\s+omada|omada|ubiquiti|uni-?fi|mikrotik|d[- ]link|ruckus|aruba(?:\s+instant\s+on)?|zyxel|cambium|grandstream|engenius)\b/i,
  },
];

const implementationPatterns: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "WLAN implementation",
    pattern: /\b(?:plan\w*|design\w*|specif\w*|select\w*|procur\w*|deploy\w*|install\w*|implement\w*|maintain\w*|operat\w*|betrieb\w*|wart\w*|beschaff\w*|liefer\w*|integrier\w*)\b.{0,80}\b(?:wi-?fi|wlan)\b|\b(?:wi-?fi|wlan)\b.{0,80}\b(?:plan\w*|design\w*|specif\w*|select\w*|procur\w*|deploy\w*|install\w*|implement\w*|maintain\w*|operat\w*|betrieb\w*|wart\w*|beschaff\w*|liefer\w*|integrier\w*)\b/i,
  },
  {
    label: "active LAN implementation",
    pattern: /\b(?:plan\w*|design\w*|specif\w*|select\w*|procur\w*|deploy\w*|implement\w*|operat\w*|betrieb\w*|beschaff\w*|integrier\w*)\b.{0,80}\b(?:lan\s+(?:infrastructure|network|solution|hardware|equipment)|local area network)\b|\b(?:lan\s+(?:infrastructure|network|solution|hardware|equipment)|local area network)\b.{0,80}\b(?:plan\w*|design\w*|specif\w*|select\w*|procur\w*|deploy\w*|implement\w*|operat\w*|betrieb\w*|beschaff\w*|integrier\w*)\b/i,
  },
];

const genericPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "generic IT infrastructure", pattern: /\bit infrastructure\b|\bit-infrastruktur\b/i },
  { label: "cloud or digital-transformation language", pattern: /\b(?:cloud connectivity|digital transformation|managed it|edge infrastructure)\b/i },
  { label: "generic integration or consulting", pattern: /\b(?:system integration|network consulting|it consulting|ip solutions?)\b/i },
  { label: "data-center or broadcast IP language", pattern: /\b(?:data cent(?:er|re)|rechenzentrum|broadcast ip)\b/i },
  { label: "generic procurement", pattern: /\bit procurement\b|\bit-beschaffung\b/i },
  { label: "passive cabling only", pattern: /\b(?:structured cabling|network cabling|fiber cabling|copper cabling|strukturierte verkabelung|netzwerkverkabelung|glasfaserverkabelung|kupferverkabelung|low[- ]voltage)\b/i },
];

function uniqueMatches(text: string, patterns: Array<{ label: string; pattern: RegExp }>): string[] {
  return patterns.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

/**
 * Applies the minimum evidence floor for a Cudy networking lead. A failed result
 * means active-networking involvement was not demonstrated by the supplied text;
 * it does not assert that the company is factually unrelated to networking.
 */
export function assessNetworkingRelevanceEvidence(values: Array<string | null | undefined>): NetworkingRelevanceAssessment {
  const text = values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n");
  const positiveSignals = uniqueMatches(text, [...positivePatterns, ...implementationPatterns]);
  const genericSignals = uniqueMatches(text, genericPatterns);
  const demonstrated = positiveSignals.length > 0;
  return {
    status: demonstrated ? "demonstrated" : "not-demonstrated",
    demonstrated,
    positiveSignals,
    genericSignals,
    reason: demonstrated
      ? `Active-networking involvement demonstrated by: ${positiveSignals.join(", ")}.`
      : genericSignals.length > 0
        ? `Only generic or passive signals were found: ${genericSignals.join(", ")}; active-networking involvement was not demonstrated.`
        : "The supplied evidence did not demonstrate active-networking products, vendor relationships, or WLAN/LAN implementation responsibility.",
  };
}
