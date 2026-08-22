import { DisabledContactLookupProvider, type ContactLookupProvider } from "./contact-lookup";
import { SnovProvider } from "./snov";

export function contactLookupProvider(): ContactLookupProvider {
  if (process.env.CONTACT_LOOKUP_ENABLED?.trim().toLowerCase() !== "true") {
    return new DisabledContactLookupProvider();
  }
  const providerId = process.env.CONTACT_LOOKUP_PROVIDER?.trim().toLowerCase() || "snov";
  if (providerId === "snov") return new SnovProvider();
  throw new Error(`Unsupported contact lookup provider: ${providerId}`);
}
