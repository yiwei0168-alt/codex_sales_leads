import type { ChannelRole } from "@/lib/domain";

export type ChannelMembershipLane = "distribution" | "resale" | "retail" | "services" | "isp";

export interface ChannelMembershipAssessment {
  lane: ChannelMembershipLane;
  demonstrated: boolean;
  supportedRoles: ChannelRole[];
  reason: string;
}

export const MULTI_ROLE_CHANNEL_POLICY = {
  version: "multi-role-channel-membership-v1",
  multiRoleRule: "Record every role supported by public evidence. A candidate may have several roles and no primary role is required.",
  noShareInference: "Do not infer the revenue share, business proportion or dominant role when public evidence only proves that a business line exists.",
  laneAdmission: "A candidate passes a submitted search lane when evidence proves that it genuinely conducts at least one role allowed in that lane, regardless of which other roles it also conducts.",
  laneEvidenceIsolation: "Each lane must be supported by evidence for that business. Evidence from another role or business line cannot substitute for the submitted lane.",
  distribution: "Distributor requires actual downstream channel supply or explicit distributor/wholesaler identity. VAD additionally requires Distributor status and substantive technical enablement.",
  resale: "Reseller requires actual product resale. VAR additionally requires resale to end customers plus substantive technical value; direct brand buying alone does not make VAD.",
  services: "SI requires solution/architecture/integration or project-outcome responsibility. Installer requires actual installation responsibility; installation execution alone does not prove SI.",
  uncertain: "When evidence suggests a role but does not prove its defining business action, retain it as a possible role for verification but do not pass that lane yet.",
  metric: "Benchmark category accuracy measures supported lane membership, not agreement on one forced primary role.",
} as const;

const rolePatterns: Array<{ role: ChannelRole; pattern: RegExp }> = [
  {
    role: "Distributor",
    pattern: /\b(?:authorized|official|technology|network(?:ing)?|it|speciali[sz]ed?|value[- ]added)\s+distribut(?:or|ion)\b|\b(?:we are|company is|acts as|operates as|is an?)\b.{0,25}\bdistributor\b|\bdistributor\s+(?:of|for)\b|\bwholesale(?:r)?\b|\b(?:suppl(?:y|ies)|beliefert|versorgt)\b.{0,70}\b(?:resellers?|dealers?|channel partners?|system integrators?|fachh(?:a|ä)ndler|wiederverk(?:a|ä)ufer)\b/i,
  },
  {
    role: "VAD",
    pattern: /\b(?:value[- ]added distributor|\bVAD\b|value added distribution)\b/i,
  },
  {
    role: "Reseller",
    pattern: /\b(?:reseller|wiederverk(?:a|ä)ufer|product reseller)\b|\b(?:sells?|selling|resells?|reselling|verkauft|vertreibt)\b.{0,60}\b(?:routers?|gateways?|access points?|wlan|wi-?fi|poe switches?|network hardware|netzwerk(?:hardware|ger(?:a|ä)te))\b/i,
  },
  {
    role: "VAR",
    pattern: /\b(?:value[- ]added reseller|\bVAR\b|\bDVAR\b|direct[- ]buy var)\b/i,
  },
  {
    role: "Dealer",
    pattern: /\b(?:authorized )?(?:network(?:ing)?|it|technology|equipment)?\s*dealer\b|\bfachh(?:a|ä)ndler\b/i,
  },
  {
    role: "Retailer",
    pattern: /\b(?:retail store|physical store|electronics retailer|brick[- ]and[- ]mortar|ladengesch(?:a|ä)ft|filiale|elektronikmarkt)\b/i,
  },
  {
    role: "E-tailer",
    pattern: /\b(?:e-?tailer|online retailer|online shop|webshop|onlineshop|add to cart|warenkorb|marketplace store)\b/i,
  },
  {
    role: "SI",
    pattern: /\b(?:system integrator|systems integrator|systemintegration|systemintegrator)\b|\b(?:designs?|architects?|integrates?|integration|plant|konzipiert|integriert)\b.{0,70}\b(?:network|wlan|wi-?fi|lan|netzwerk|multi[- ]vendor|systems?)\b/i,
  },
  {
    role: "Installer",
    pattern: /\b(?:network|wlan|wi-?fi|lan|access point|router|switch|netzwerk)\b.{0,60}\b(?:installer|installation|installs?|installiert|montage)\b|\b(?:installer|installation|installs?|installiert|montage)\b.{0,60}\b(?:network|wlan|wi-?fi|lan|access point|router|switch|netzwerk)\b/i,
  },
  {
    role: "MSP",
    pattern: /\b(?:managed service provider|managed network services?|managed wi-?fi|managed wlan|\bMSP\b)\b/i,
  },
  {
    role: "ISP",
    pattern: /\b(?:internet service provider|wireless internet service provider|\bWISP\b|broadband provider|internet provider|internetanbieter|breitbandanbieter)\b|\b(?:internet|broadband|breitband)\s+(?:plans?|packages?|tariffs?|tarife|anschluss)\b/i,
  },
];

const laneRoles: Record<ChannelMembershipLane, readonly ChannelRole[]> = {
  distribution: ["Distributor", "VAD"],
  resale: ["VAR", "Dealer", "Reseller"],
  retail: ["Retailer", "E-tailer"],
  services: ["SI", "Installer", "MSP"],
  isp: ["ISP"],
};

export function assessChannelMembershipEvidence(options: {
  lane: ChannelMembershipLane;
  evidence: Array<string | null | undefined>;
}): ChannelMembershipAssessment {
  const text = options.evidence.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n");
  const supportedRoles = [...new Set(rolePatterns.filter(({ pattern }) => pattern.test(text)).map(({ role }) => role))];
  if (supportedRoles.includes("VAD") && !supportedRoles.includes("Distributor")) supportedRoles.push("Distributor");
  if (supportedRoles.includes("VAR") && !supportedRoles.includes("Reseller")) supportedRoles.push("Reseller");
  if (supportedRoles.includes("Dealer") && !supportedRoles.includes("Reseller")) supportedRoles.push("Reseller");
  const admittedRoles = supportedRoles.filter((role) => laneRoles[options.lane].includes(role));
  return {
    lane: options.lane,
    demonstrated: admittedRoles.length > 0,
    supportedRoles,
    reason: admittedRoles.length > 0
      ? `Evidence demonstrates submitted-lane role(s): ${admittedRoles.join(", ")}. Other supported roles do not invalidate the lane.`
      : `Evidence did not demonstrate a defining business action for any role allowed in the ${options.lane} lane; possible but unproven roles remain pending verification.`,
  };
}
