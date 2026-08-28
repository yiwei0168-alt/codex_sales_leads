import type { ChannelRole } from "@/lib/domain";

import { CHANNEL_ROLE_FAMILIES, type ChannelRoleFamily } from "./workflow/types";

export type LeadDisplayChannel = "tier1-distribution" | "b2b-resale" | "project-services";

export interface PrimaryChannelSelection {
  primaryRole: ChannelRole | null;
  primaryFamily: ChannelRoleFamily | null;
  primaryChannel: LeadDisplayChannel | null;
  supportedFamilies: ChannelRoleFamily[];
  usedSmallLongTailException: boolean;
  reason: string;
}

export const PRIMARY_CHANNEL_POLICY = {
  version: "primary-channel-v1",
  allRolesRetained: "Retain every evidence-supported role; primary means display and scoring route, not revenue dominance.",
  upwardDefault: "When both distribution and downstream roles are supported, use distribution as the primary route.",
  smallLongTailException: "A positively evidenced small long-tail company uses a supported downstream route instead of distribution when both exist.",
  downstreamOrder: "Without distribution, prefer resale, then retail, then services, then ISP for one deterministic display route.",
  prohibitedInference: "Missing size evidence never activates the small long-tail exception.",
} as const;

const familyOrder: ChannelRoleFamily[] = ["distribution", "resale", "retail", "services", "isp"];
const roleOrder: ChannelRole[] = [
  "VAD", "Distributor",
  "VAR", "Dealer", "Reseller",
  "E-tailer", "Retailer",
  "SI", "MSP", "Installer",
  "ISP",
];

function familiesForRoles(roles: ChannelRole[]): ChannelRoleFamily[] {
  return familyOrder.filter((family) => roles.some((role) => CHANNEL_ROLE_FAMILIES[family].includes(role as never)));
}

function displayChannel(family: ChannelRoleFamily): LeadDisplayChannel {
  if (family === "distribution") return "tier1-distribution";
  if (family === "resale" || family === "retail") return "b2b-resale";
  return "project-services";
}

function roleForFamily(roles: ChannelRole[], family: ChannelRoleFamily): ChannelRole | null {
  const allowed = CHANNEL_ROLE_FAMILIES[family] as readonly ChannelRole[];
  return roleOrder.find((role) => roles.includes(role) && allowed.includes(role)) ?? null;
}

export function selectPrimaryChannel(options: {
  roles: ChannelRole[];
  smallLongTailExceptionEligible: boolean;
}): PrimaryChannelSelection {
  const roles = [...new Set(options.roles)];
  const supportedFamilies = familiesForRoles(roles);
  if (supportedFamilies.length === 0) {
    return {
      primaryRole: null,
      primaryFamily: null,
      primaryChannel: null,
      supportedFamilies: [],
      usedSmallLongTailException: false,
      reason: "No evidence-supported role family is available for primary-channel selection.",
    };
  }

  const hasDistribution = supportedFamilies.includes("distribution");
  const downstream = supportedFamilies.filter((family) => family !== "distribution");
  const usedSmallLongTailException = hasDistribution && downstream.length > 0
    && options.smallLongTailExceptionEligible;
  const primaryFamily = usedSmallLongTailException ? downstream[0]
    : hasDistribution ? "distribution"
      : supportedFamilies[0];
  const primaryRole = roleForFamily(roles, primaryFamily);
  return {
    primaryRole,
    primaryFamily,
    primaryChannel: displayChannel(primaryFamily),
    supportedFamilies,
    usedSmallLongTailException,
    reason: usedSmallLongTailException
      ? `Positive small-long-tail evidence moved the display route from distribution to supported downstream family ${primaryFamily}.`
      : hasDistribution && downstream.length > 0
        ? "Distribution is the primary display route under the upward-default rule; all downstream roles remain recorded."
        : `${primaryFamily} is the highest supported family in the deterministic display hierarchy.`,
  };
}
