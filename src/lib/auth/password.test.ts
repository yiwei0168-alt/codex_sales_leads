import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("single-user password hashing", () => {
  it("verifies the original password and rejects another password", () => {
    const hash = hashPassword("a-secure-pilot-password");
    expect(verifyPassword("a-secure-pilot-password", hash)).toBe(true);
    expect(verifyPassword("another-password", hash)).toBe(false);
  });

  it("rejects short passwords and malformed hashes", () => {
    expect(() => hashPassword("too-short")).toThrow(/12/);
    expect(verifyPassword("a-secure-pilot-password", "not-a-hash")).toBe(false);
  });
});
