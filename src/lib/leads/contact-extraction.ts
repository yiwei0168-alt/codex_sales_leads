const genericLocals = new Set([
  "admin", "administracion", "atencion", "atencionaclientes", "careers", "comercial", "compras", "contact", "contacto",
  "facturacion", "hola", "info", "legal", "marketing", "noc", "privacidad", "reclutamiento", "rh", "rrhh", "sales",
  "servicio", "serviciocliente", "soporte", "support", "ventas", "webmaster",
]);
const invalidEmailLocals = new Set(["emailinfo", "likes", "noreply", "no-reply", "example", "yourname", "tuemail"]);

export type PersonalizedEmailPattern = "first.last" | "first_last";

export function extractDomainEmails(text: string, domain: string): string[] {
  const normalizedDomain = domain.toLowerCase();
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase().replace(/[),.;:]+$/, "")))]
    .filter((email) => {
      if (!email.endsWith(`@${normalizedDomain}`)) return false;
      const local = email.split("@")[0];
      return !invalidEmailLocals.has(local) && !(local.startsWith("email") && genericLocals.has(local.slice(5)));
    });
}

export function personalizedEmailPattern(email: string): PersonalizedEmailPattern | null {
  const local = email.toLowerCase().split("@")[0];
  if (genericLocals.has(local)) return null;
  if (/^[a-z]+\.[a-z]+$/.test(local)) return "first.last";
  if (/^[a-z]+_[a-z]+$/.test(local)) return "first_last";
  return null;
}

export function personNameFromPersonalEmail(email: string): string | null {
  const pattern = personalizedEmailPattern(email);
  if (!pattern) return null;
  const parts = email.toLowerCase().split("@")[0].split(pattern === "first.last" ? "." : "_");
  if (parts.length !== 2) return null;
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function asciiToken(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
}

export function guessPersonalEmail(fullName: string, domain: string, pattern: PersonalizedEmailPattern): string | null {
  const parts = fullName.split(/\s+/).map(asciiToken).filter(Boolean);
  if (parts.length !== 2) return null;
  const local = pattern === "first.last" ? `${parts[0]}.${parts[1]}` : `${parts[0]}_${parts[1]}`;
  return `${local}@${domain.toLowerCase()}`;
}
