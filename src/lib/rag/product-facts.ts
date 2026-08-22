import { createHash } from "node:crypto";

export type ProductFactGroup = "identity" | "wireless" | "network" | "interface" | "protocol" | "management" | "feature";

export interface StructuredProductFact {
  factGroup: ProductFactGroup;
  factKey: string;
  factValue: string;
  normalizedValue: string;
  numericValue?: number;
  unit?: string;
  evidenceExcerpt: string;
  factHash: string;
}

interface ProductFactInput {
  model: string;
  productName: string;
  category: string;
  description: string;
  brand: string;
  lifecycleStatus: string;
}

interface FactRule {
  group: ProductFactGroup;
  key: string;
  value: string;
  pattern: RegExp;
}

const RULES: FactRule[] = [
  { group: "wireless", key: "wireless_generation", value: "Wi-Fi 7", pattern: /\bwi-?fi\s*7\b/i },
  { group: "wireless", key: "wireless_generation", value: "Wi-Fi 6", pattern: /\bwi-?fi\s*6\b/i },
  { group: "wireless", key: "wireless_generation", value: "Wi-Fi 5", pattern: /\b(?:wi-?fi\s*5|802\.11ac)\b/i },
  { group: "wireless", key: "frequency_band", value: "6 GHz", pattern: /\b6\s*ghz\b/i },
  { group: "wireless", key: "frequency_band", value: "5 GHz", pattern: /\b5\s*ghz\b/i },
  { group: "wireless", key: "frequency_band", value: "2.4 GHz", pattern: /\b2\.4\s*ghz\b/i },
  { group: "network", key: "cellular_generation", value: "5G", pattern: /\b5g\b/i },
  { group: "network", key: "cellular_generation", value: "4G LTE", pattern: /\b(?:4g|lte)\b/i },
  { group: "network", key: "pon_standard", value: "GPON", pattern: /\bgpon\b/i },
  { group: "network", key: "pon_standard", value: "XGS-PON", pattern: /\bxgs-?pon\b/i },
  { group: "interface", key: "ethernet_speed", value: "10 Gbps", pattern: /\b10\s*g(?:bps|igabit)?\b/i },
  { group: "interface", key: "ethernet_speed", value: "2.5 Gbps", pattern: /\b2\.5\s*g(?:bps|igabit)?\b/i },
  { group: "interface", key: "ethernet_speed", value: "1 Gbps", pattern: /\b(?:1\s*g(?:bps|igabit)?|10\/100\/1000\s*mbps|gigabit)\b/i },
  { group: "interface", key: "interface_type", value: "SFP+", pattern: /\bsfp\+\b/i },
  { group: "interface", key: "interface_type", value: "SFP", pattern: /\bsfp\b/i },
  { group: "interface", key: "interface_type", value: "USB 3.0", pattern: /\busb\s*3\.0\b/i },
  { group: "interface", key: "interface_type", value: "USB", pattern: /\busb\b/i },
  { group: "network", key: "poe_standard", value: "802.3at", pattern: /\b802\.3at\b/i },
  { group: "network", key: "poe_standard", value: "802.3af", pattern: /\b802\.3af\b/i },
  { group: "network", key: "poe_capability", value: "PoE", pattern: /\bpoe\b/i },
  { group: "protocol", key: "vpn_protocol", value: "WireGuard", pattern: /\bwireguard\b/i },
  { group: "protocol", key: "vpn_protocol", value: "OpenVPN", pattern: /\bopenvpn\b/i },
  { group: "protocol", key: "vpn_protocol", value: "IPSec", pattern: /\bipsec\b/i },
  { group: "protocol", key: "vpn_protocol", value: "L2TP", pattern: /\bl2tp\b/i },
  { group: "protocol", key: "vpn_protocol", value: "PPTP", pattern: /\bpptp\b/i },
  { group: "management", key: "remote_management", value: "TR-069 family", pattern: /\btr(?:069|098|111|181)\b/i },
  { group: "management", key: "management_platform", value: "Cudy APP", pattern: /\bcudy\s+app\b/i },
  { group: "management", key: "management_platform", value: "Cloud management", pattern: /\bcloud(?:-based)?\s+(?:management|controller)\b/i },
  { group: "feature", key: "network_feature", value: "Mesh", pattern: /\bmesh\b/i },
  { group: "feature", key: "network_feature", value: "MLO", pattern: /\bmlo\b/i },
  { group: "feature", key: "network_feature", value: "MU-MIMO", pattern: /\bmu-?mimo\b/i },
  { group: "feature", key: "security_feature", value: "WPA3", pattern: /\bwpa3\b/i },
  { group: "feature", key: "network_feature", value: "IPv6", pattern: /\bipv6\b/i },
  { group: "feature", key: "network_feature", value: "IPTV", pattern: /\biptv\b/i },
  { group: "feature", key: "network_feature", value: "Seamless Roaming", pattern: /\bseamless\s+roaming\b/i },
  { group: "feature", key: "operating_mode", value: "Access Point", pattern: /\b(?:ap|access point)\s*(?:mode)?\b/i },
  { group: "feature", key: "operating_mode", value: "Repeater", pattern: /\brepeater\s*(?:mode)?\b/i },
  { group: "feature", key: "operating_mode", value: "WISP", pattern: /\bwisp\s*(?:mode)?\b/i },
];

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

function excerptFor(description: string, match: RegExpMatchArray | null): string {
  if (!match?.index) return description.slice(0, 500);
  const start = Math.max(0, match.index - 90);
  return description.slice(start, Math.min(description.length, match.index + match[0].length + 150)).trim();
}

function makeFact(input: Omit<StructuredProductFact, "factHash">): StructuredProductFact {
  return {
    ...input,
    factHash: createHash("sha256")
      .update(`${input.factGroup}\u0000${input.factKey}\u0000${input.normalizedValue}\u0000${input.evidenceExcerpt}`)
      .digest("hex"),
  };
}

export function extractStructuredProductFacts(product: ProductFactInput): StructuredProductFact[] {
  const identityFacts: StructuredProductFact[] = [
    ["product_name", product.productName],
    ["category", product.category],
    ["brand", product.brand],
    ["lifecycle_status", product.lifecycleStatus],
  ].map(([factKey, factValue]) => makeFact({
    factGroup: "identity",
    factKey,
    factValue,
    normalizedValue: normalized(factValue),
    evidenceExcerpt: `${product.model}: ${factValue}`,
  }));

  const extracted = RULES.flatMap((rule) => {
    const match = product.description.match(rule.pattern);
    if (!match) return [];
    return [makeFact({
      factGroup: rule.group,
      factKey: rule.key,
      factValue: rule.value,
      normalizedValue: normalized(rule.value),
      evidenceExcerpt: excerptFor(product.description, match),
    })];
  });

  const speeds = Array.from(product.description.matchAll(/\b(\d+(?:\.\d+)?)\s*(Mbps|Gbps)\b/gi)).map((match) => {
    const numericValue = Number(match[1]);
    const unit = match[2].toLowerCase() === "gbps" ? "Gbps" : "Mbps";
    return makeFact({
      factGroup: "network",
      factKey: "advertised_link_rate",
      factValue: `${numericValue} ${unit}`,
      normalizedValue: `${numericValue}-${unit.toLowerCase()}`,
      numericValue,
      unit,
      evidenceExcerpt: excerptFor(product.description, match),
    });
  });

  const unique = new Map<string, StructuredProductFact>();
  for (const fact of [...identityFacts, ...extracted, ...speeds]) {
    unique.set(`${fact.factKey}:${fact.normalizedValue}`, fact);
  }
  return [...unique.values()];
}
