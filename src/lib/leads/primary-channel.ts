import type { ChannelRole } from "@/lib/domain";

import { CHANNEL_ROLE_FAMILIES, type ChannelRoleFamily, type PrimaryBusinessRole } from "./workflow/types";

export type LeadDisplayChannel = "tier1-distribution" | "b2b-resale" | "project-services";

export interface PrimaryChannelSelection {
  primaryRole: PrimaryBusinessRole;
  primaryFamily: ChannelRoleFamily | null;
  primaryChannel: LeadDisplayChannel | null;
  supportedFamilies: ChannelRoleFamily[];
  usedSmallLongTailException: boolean;
  reason: string;
}

export const PRIMARY_CHANNEL_POLICY = {
  version: "primary-business-role-v2",
  allRolesRetained: "Retain every evidence-supported role; the evidence-correction agent independently determines the main business role.",
  noUpwardDefault: "The original search lane and any upward channel hierarchy are prohibited as primary-role inputs.",
  hybridAllowed: "Use Hybrid when multiple business-role families are materially co-primary and Unresolved when evidence is insufficient or conflicting.",
} as const;

const familyOrder: ChannelRoleFamily[] = ["distribution", "resale", "retail", "services", "isp"];
function familiesForRoles(roles: ChannelRole[]): ChannelRoleFamily[] {
  return familyOrder.filter((family) => roles.some((role) => CHANNEL_ROLE_FAMILIES[family].includes(role as never)));
}

function displayChannel(family: ChannelRoleFamily): LeadDisplayChannel {
  if (family === "distribution") return "tier1-distribution";
  if (family === "resale" || family === "retail") return "b2b-resale";
  return "project-services";
}

export function selectPrimaryChannel(options: {
  roles: ChannelRole[];
  agentPrimaryRole: PrimaryBusinessRole;
}): PrimaryChannelSelection {
  const roles = [...new Set(options.roles)];
  const supportedFamilies = familiesForRoles(roles);
  const primaryRole = options.agentPrimaryRole;
  if (primaryRole === "Hybrid" || primaryRole === "Unresolved") {
    return {
      primaryRole,
      primaryFamily: null,
      primaryChannel: null,
      supportedFamilies,
      usedSmallLongTailException: false,
      reason: `${primaryRole} was selected by the role agent; no deterministic display hierarchy was applied.`,
    };
  }
  const primaryFamily = (Object.entries(CHANNEL_ROLE_FAMILIES) as Array<[ChannelRoleFamily, readonly ChannelRole[]]>)
    .find(([, allowed]) => allowed.includes(primaryRole))?.[0] ?? null;
  if (!roles.includes(primaryRole) || !primaryFamily) {
    return { primaryRole: "Unresolved", primaryFamily: null, primaryChannel: null, supportedFamilies,
      usedSmallLongTailException: false,
      reason: "The agent-selected primary role was not evidence-supported and was normalized to Unresolved." };
  }
  return {
    primaryRole,
    primaryFamily,
    primaryChannel: displayChannel(primaryFamily),
    supportedFamilies,
    usedSmallLongTailException: false,
    reason: `${primaryRole} was selected by the role agent from evidence-supported roles; the original search lane was ignored.`,
  };
}
