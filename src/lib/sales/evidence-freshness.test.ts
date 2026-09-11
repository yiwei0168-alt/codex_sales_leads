import { expect, it } from "vitest";
import type { Evidence } from "@/lib/domain";
import { evidenceFreshness } from "./evidence-freshness";

it("uses dated verified evidence and never treats a recent inference as reverification", () => {
  const now = new Date("2026-09-11T00:00:00Z");
  const old = { status: "Verified", capturedAt: "2025-09-10T00:00:00Z" } as Evidence;
  expect(evidenceFreshness([old, { status: "Inferred", capturedAt: now.toISOString() } as Evidence], now)).toBe("older-than-year");
  expect(evidenceFreshness([{ ...old, capturedAt: "2025-09-11T00:00:00Z" }], now)).toBe("current");
  expect(evidenceFreshness([{ ...old, capturedAt: "bad-date" }], now)).toBe("unknown");
  expect(evidenceFreshness([], now)).toBe("unknown");
});
