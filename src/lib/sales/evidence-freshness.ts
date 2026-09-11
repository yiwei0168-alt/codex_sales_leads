import type { Evidence } from "@/lib/domain";

export function evidenceFreshness(evidence: Evidence[], now = new Date()): "current" | "older-than-year" | "unknown" {
  const verified = evidence.filter((item) => item.status === "Verified" || item.status === "Corroborated")
    .map((item) => Date.parse(item.capturedAt)).filter((value) => Number.isFinite(value) && value <= now.getTime());
  if (!verified.length) return "unknown";
  const boundary = new Date(now);
  boundary.setUTCFullYear(boundary.getUTCFullYear() - 1);
  return Math.max(...verified) < boundary.getTime() ? "older-than-year" : "current";
}
