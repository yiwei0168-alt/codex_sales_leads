import { CHANNEL_ROLE_FAMILIES, type LeadCandidateCorrection } from "./types";

/** Never infer business rejection or permission to replay a paid request from this status. */
export function correctionCompletion(correction: LeadCandidateCorrection):
  "completed" | "unresolved" | "retry-required" {
  if (correction.completionStatus === "retry-required" || correction.model === "deterministic-fallback") {
    return "retry-required";
  }
  const families = Object.entries(CHANNEL_ROLE_FAMILIES)
    .filter(([, roles]) => correction.resolvedRoles.some(role => (roles as readonly string[]).includes(role)))
    .map(([family]) => family);
  if (correction.resolvedRoles.some(role => !Object.values(CHANNEL_ROLE_FAMILIES)
    .some(roles => (roles as readonly string[]).includes(role)))
    || families.length !== new Set(correction.resolvedFamilies).size
    || families.some(family => !(correction.resolvedFamilies as string[]).includes(family))) return "retry-required";
  if (correction.primaryRole === "Unresolved") return "unresolved";
  if (correction.primaryRole === "Hybrid") {
    return families.length >= 2 && correction.primaryFamily === null ? "completed" : "retry-required";
  }
  const family = Object.entries(CHANNEL_ROLE_FAMILIES)
    .find(([, roles]) => (roles as readonly string[]).includes(correction.primaryRole))?.[0];
  return correction.resolvedRoles.includes(correction.primaryRole) && family === correction.primaryFamily
    ? "completed" : "retry-required";
}
