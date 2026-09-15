export interface PublicReviewRedactionCounts {
  credential: number;
  email: number;
  phone: number;
  idNumber: number;
  paymentCard: number;
}

export interface PublicReviewDisclosure<T> {
  value: T;
  redactionCounts: PublicReviewRedactionCounts;
}

const REDACTIONS: Array<[keyof PublicReviewRedactionCounts, RegExp, string]> = [
  ["credential", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    "[credential removed]"],
  ["credential", /\b(?:password|passwd|api[_ -]?key|access[_ -]?token|secret)\s*[:=：]\s*[^\s,;]+/gi,
    "[credential removed]"],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]"],
  ["phone", /(?:\b(?:tel|telephone|phone|mobile|whatsapp|telefon|kontakt)\b\s*[:=：]?\s*|\+)(?:\d[\s().-]*){7,14}(?![\dA-Z])/gi,
    "[phone removed]"],
  ["phone", /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d{9}(?!\d)/g, "[phone removed]"],
  ["idNumber", /(?<!\d)\d{17}[\dXx](?!\d)/g, "[id number removed]"],
  ["paymentCard", /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, "[payment card removed]"],
];

const initialCounts = (): PublicReviewRedactionCounts => ({
  credential: 0, email: 0, phone: 0, idNumber: 0, paymentCard: 0,
});

function sanitizeText(value: string, counts: PublicReviewRedactionCounts): string {
  let output = value.replace(/\u0000/g, "");
  for (const [name, pattern, replacement] of REDACTIONS) {
    output = output.replace(pattern, () => {
      counts[name] += 1;
      return replacement;
    });
  }
  return output;
}

function sanitizeValue(value: unknown, counts: PublicReviewRedactionCounts): unknown {
  if (typeof value === "string") return sanitizeText(value, counts);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, counts));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, counts)]));
  }
  return value;
}

/**
 * Produces the only form of public evidence that may cross the external-review boundary.
 * The caller must already have selected public or publicly sourced business evidence; this
 * function removes incidental contact and credential-shaped data without removing source URLs.
 */
export function preparePublicReviewDisclosure<T>(value: T): PublicReviewDisclosure<T> {
  const redactionCounts = initialCounts();
  return { value: sanitizeValue(value, redactionCounts) as T, redactionCounts };
}
