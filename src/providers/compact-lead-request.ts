import type { StructuredAiRequest } from "./contracts";
import { deepSeekRequestBody } from "./deepseek-request";
import { leadRequestByteLimit } from "./lead-request-bounds";

type EvidenceText = { title?: string; excerpt?: string; [key: string]: unknown };
type CandidateInput = { evidence?: EvidenceText[]; [key: string]: unknown };

/** Lossless request-only compression. Original evidence, findings and citation identities never mutate. */
export function compactLeadSingleton<T extends StructuredAiRequest<unknown>>(request: T,
  requestBytes: (value: StructuredAiRequest<unknown>) => number = value =>
    Buffer.byteLength(deepSeekRequestBody(value).body, "utf8")): T {
  const input = request.input as { candidates?: CandidateInput[]; instructions?: string[] } | null;
  const limit = leadRequestByteLimit(request);
  if (limit === null || !input || input.candidates?.length !== 1 || requestBytes(request) <= limit) return request;
  const evidence = input.candidates[0].evidence;
  if (!evidence?.length || !Array.isArray(input.instructions)) return request;
  const frequencies = new Map<string, number>();
  for (const item of evidence) for (const field of ["title", "excerpt"] as const) {
    const text = item[field];
    if (typeof text === "string" && text.length >= 256) frequencies.set(text, (frequencies.get(text) ?? 0) + 1);
  }
  const repeated = [...frequencies].filter(([, count]) => count > 1).map(([text]) => text);
  if (!repeated.length) return request;
  const ids = new Map(repeated.map((text, index) => [text, `text-${index}`]));
  const compacted = {
    ...request,
    input: {
      ...input,
      instructions: [...input.instructions,
        "Lossless evidence text dictionary: titleTextRef and excerptTextRef refer to evidenceTextDictionary entries. Resolve each reference to its exact text before assessing that evidence item. Each item retains its own evidenceId, URL and sourceType; shared text never proves independent corroboration or shared company identity."],
      evidenceTextDictionary: Object.fromEntries(repeated.map(text => [ids.get(text)!, text])),
      evidenceTextEncoding: "exact-duplicate-text-v1",
      candidates: [{ ...input.candidates[0], evidence: evidence.map(item => {
        const copy: EvidenceText = { ...item };
        for (const field of ["title", "excerpt"] as const) {
          const id = ids.get(item[field] ?? "");
          if (id) { delete copy[field]; copy[`${field}TextRef`] = id; }
        }
        return copy;
      }) }],
    },
  } as T;
  // Never make a payload larger merely to use a different representation.
  return requestBytes(compacted) < requestBytes(request) ? compacted : request;
}
