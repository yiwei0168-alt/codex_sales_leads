import type { StructuredAiRequest } from "./contracts";
import { deepSeekRequestBody } from "./deepseek-request";
import { leadRequestByteLimit } from "./lead-request-bounds";

type EvidenceText = { title?: string; excerpt?: string; [key: string]: unknown };
type CandidateInput = { evidence?: EvidenceText[]; [key: string]: unknown };

/** Uniform rows preserve every value and distinguish missing fields from explicit null. */
function fieldTable(value: unknown) {
  if (!Array.isArray(value) || value.length < 2
    || !value.every(row => row && typeof row === "object" && !Array.isArray(row))) return null;
  const records = value as Record<string, unknown>[];
  const columns = Object.keys(records[0]);
  if (!columns.length || !records.every(row => Object.keys(row).length === columns.length
    && columns.every(column => Object.hasOwn(row, column) && row[column] !== undefined))) return null;
  return { columns, rows: records.map(row => columns.map(column => row[column])) };
}

function compactFieldTables<T extends StructuredAiRequest<unknown>>(request: T): T {
  const input = request.input as { candidates: CandidateInput[]; instructions: string[]; candidateTableEncoding?: unknown };
  if (input.candidateTableEncoding !== undefined) return request;
  const candidate = { ...input.candidates[0] };
  let changed = false;
  for (const field of ["evidence", "findings"] as const) {
    if (Object.hasOwn(candidate, `${field}Table`)) continue;
    const table = fieldTable(candidate[field]);
    if (!table) continue;
    candidate[`${field}Table`] = table;
    delete candidate[field];
    changed = true;
  }
  if (!changed) return request;
  return { ...request, input: { ...input, candidates: [candidate], candidateTableEncoding: "exact-field-table-v1",
    instructions: [...input.instructions,
      "Lossless candidate field tables: evidenceTable and findingsTable replace only their corresponding arrays. Reconstruct each ordered row as an object by pairing columns[i] with row[i], retaining every value, nested structure, null and original row order. Then apply all original evidence and scoring instructions. No fact or citation is omitted; table rows do not imply corroboration, identity equivalence or eligibility. Resolve evidenceTextDictionary references after reconstruction when present."] } } as T;
}

/** Lossless request-only compression. Original evidence, findings and citation identities never mutate. */
export function compactLeadSingleton<T extends StructuredAiRequest<unknown>>(request: T,
  requestBytes: (value: StructuredAiRequest<unknown>) => number = value =>
    Buffer.byteLength(deepSeekRequestBody(value).body, "utf8")): T & Pick<StructuredAiRequest<unknown>, "preparation"> {
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
  const ids = new Map(repeated.map((text, index) => [text, `text-${index}`]));
  const compacted = repeated.length ? {
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
  } as T : request;
  // Never make a payload larger merely to use a different representation.
  let smallest = requestBytes(compacted) < requestBytes(request) ? compacted : request;
  const finish = (value: T): T => value === request ? request : { ...value, preparation: {
    encoding: [(value.input as Record<string, unknown>).evidenceTextEncoding,
      (value.input as Record<string, unknown>).candidateTableEncoding].filter(Boolean).join("+"),
    originalMaximumWireBytes: requestBytes(request), preparedMaximumWireBytes: requestBytes(value),
    evidenceItems: evidence.length,
    findingItems: Array.isArray(input.candidates![0].findings) ? input.candidates![0].findings.length : 0,
  } };
  if (requestBytes(smallest) <= limit) return finish(smallest);
  // Unique facts can still benefit from storing repeated field names once. Try both
  // forms because a text dictionary may create heterogeneous rows that cannot be tabled.
  for (const candidate of [request, smallest]) {
    const tabled = compactFieldTables(candidate);
    if (requestBytes(tabled) < requestBytes(smallest)) smallest = tabled;
  }
  return finish(smallest);
}
