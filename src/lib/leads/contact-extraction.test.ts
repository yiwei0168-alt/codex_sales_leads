import { describe, expect, it } from "vitest";
import { extractDomainEmails, guessPersonalEmail, personNameFromPersonalEmail, personalizedEmailPattern } from "./contact-extraction";

describe("contact extraction", () => {
  it("keeps public company emails and rejects page-label concatenation and social metadata", () => {
    expect(extractDomainEmails(
      "Email info@astratelecom.com.mx emailinfo@astratelecom.com.mx likes@astratelecom.com.mx outside@example.com",
      "astratelecom.com.mx",
    )).toEqual(["info@astratelecom.com.mx"]);
  });

  it("does not treat generic mailboxes as a personalized pattern", () => {
    expect(personalizedEmailPattern("ventas@mcs.com.mx")).toBeNull();
    expect(personalizedEmailPattern("jessica.hernandez@mcs.com.mx")).toBe("first.last");
    expect(personNameFromPersonalEmail("jessica.hernandez@mcs.com.mx")).toBe("Jessica Hernandez");
  });

  it("only guesses unambiguous two-token names", () => {
    expect(guessPersonalEmail("Francisco Rodríguez", "mcs.com.mx", "first.last")).toBe("francisco.rodriguez@mcs.com.mx");
    expect(guessPersonalEmail("Pablo Alberto Martinez Elton", "sily.mx", "first.last")).toBeNull();
  });
});
