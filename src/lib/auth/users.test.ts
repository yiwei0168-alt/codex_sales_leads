import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "./users";

describe("multi-user login identity", () => {
  it("normalizes email identities before lookup", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("rejects malformed or oversized email identities", () => {
    expect(isValidEmail("owner@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail(`${"a".repeat(310)}@example.com`)).toBe(false);
  });
});
