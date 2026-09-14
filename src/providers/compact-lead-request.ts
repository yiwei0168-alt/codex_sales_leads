import type { StructuredAiRequest } from "./contracts";
import { deepSeekRequestBody } from "./deepseek-request";
import { leadRequestByteLimit } from "./lead-request-bounds";

type EvidenceText = { title?: string; excerpt?: string; [key: string]: unknown };
type CandidateInput = {
  evidence?: EvidenceText[];
  findings?: Array<{ statement?: string; [key: string]: unknown }>;
  evidenceTable?: { columns: string[]; rows: unknown[][] };
  findingsTable?: { columns: string[]; rows: unknown[][] };
  [key: string]: unknown;
};

function proseValues(candidate: CandidateInput): string[] {
  const values: string[] = [];
  for (const item of candidate.evidence ?? []) for (const key of ["title", "excerpt"] as const)
    if (typeof item[key] === "string") values.push(item[key]);
  for (const item of candidate.findings ?? []) if (typeof item.statement === "string") values.push(item.statement);
  for (const [table, fields] of [[candidate.evidenceTable, ["title", "excerpt"]],
    [candidate.findingsTable, ["statement"]]] as const) {
    if (!table) continue;
    for (const row of table.rows) for (const field of fields) {
      const index = table.columns.indexOf(field);
      if (index >= 0 && typeof row[index] === "string") values.push(row[index]);
    }
  }
  return values;
}

function replaceProse(candidate: CandidateInput, phrase: string, marker: string): CandidateInput {
  const replace = (value: unknown) => typeof value === "string" ? value.replaceAll(phrase, marker) : value;
  const replaceTable = (table: CandidateInput["evidenceTable"], fields: readonly string[]) => table && ({
    ...table, rows: table.rows.map(row => row.map((value, index) =>
      fields.includes(table.columns[index]) ? replace(value) : value)),
  });
  return { ...candidate,
    ...(candidate.evidence ? { evidence: candidate.evidence.map(item => ({ ...item,
      ...(typeof item.title === "string" ? { title: replace(item.title) } : {}),
      ...(typeof item.excerpt === "string" ? { excerpt: replace(item.excerpt) } : {}),
    })) } : {}),
    ...(candidate.findings ? { findings: candidate.findings.map(item => ({ ...item,
      ...(typeof item.statement === "string" ? { statement: replace(item.statement) } : {}),
    })) } : {}),
    ...(candidate.evidenceTable ? { evidenceTable: replaceTable(candidate.evidenceTable, ["title", "excerpt"]) } : {}),
    ...(candidate.findingsTable ? { findingsTable: replaceTable(candidate.findingsTable, ["statement"]) } : {}),
  } as CandidateInput;
}

/** Exact repeated phrases remain recoverable even when whole excerpts differ. */
function compactSharedPhrases<T extends StructuredAiRequest<unknown>>(request: T,
  requestBytes: (value: StructuredAiRequest<unknown>) => number, limit: number): T {
  if (request.task !== "lead-qualification") return request;
  const input = request.input as { candidates?: CandidateInput[]; instructions?: string[];
    sharedPhraseDictionary?: Record<string, string>; sharedPhraseEncoding?: string } | null;
  if (!input?.candidates || input.candidates.length !== 1 || !Array.isArray(input.instructions)
    || input.sharedPhraseEncoding) return request;
  let current = request;
  for (let index = 0; index < 8 && requestBytes(current) > limit; index++) {
    const currentInput = current.input as typeof input;
    const values = proseValues(currentInput!.candidates![0]);
    const marker = `~P${index}~`;
    if (JSON.stringify(currentInput).includes(marker)) break;
    const counts = new Map<string, number>();
    let wordCount = 0;
    for (const value of values) {
      const words = [...value.matchAll(/\S+/g)];
      wordCount += words.length;
      if (wordCount > 20_000) return current;
      for (let start = 0; start < words.length; start++) for (let width = 2;
        width <= 6 && start + width <= words.length; width++) {
        const phrase = value.slice(words[start].index!,
          words[start + width - 1].index! + words[start + width - 1][0].length);
        if (phrase.length < 24 || phrase.length > 100 || phrase.includes("~P")) continue;
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
    const best = [...counts].map(([phrase, count]) => ({ phrase,
      score: (Buffer.byteLength(phrase, "utf8") - marker.length) * (count - 1) - 128 }))
      .filter(item => item.score > 512)
      .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase))[0];
    if (!best) break;
    const candidate = { ...current, input: { ...currentInput!,
      candidates: [replaceProse(currentInput!.candidates![0], best.phrase, marker)],
      sharedPhraseDictionary: { ...currentInput!.sharedPhraseDictionary, [marker]: best.phrase },
      sharedPhraseEncoding: "exact-shared-phrase-v1",
      instructions: index === 0 ? [...currentInput!.instructions!,
        "Exact shared phrase markers in evidence or finding prose refer to sharedPhraseDictionary. Expand every marker to its exact text before judging a fact or citation. Preserve every evidence ID, URL, finding, status and original order; shared words are not independent corroboration."]:
        currentInput!.instructions!,
    } } as T;
    if (requestBytes(candidate) >= requestBytes(current)) break;
    current = candidate;
  }
  return current;
}

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

/** Keep every corrected fact and source identity; fold only supported-fact excerpts when needed. */
function foldSupportedExcerpts<T extends StructuredAiRequest<unknown>>(request:T,
  requestBytes:(value:StructuredAiRequest<unknown>)=>number,limit:number):T{
  if(request.task!=="lead-qualification")return request;
  const input=request.input as {candidates?:CandidateInput[];instructions?:string[];
    evidenceExcerptEncoding?:unknown}|null;
  if(!input?.candidates||input.candidates.length!==1||!Array.isArray(input.instructions)
    ||input.evidenceExcerptEncoding!==undefined)return request;
  const candidate=input.candidates[0],evidence=candidate.evidence,findings=candidate.findings;
  if(!evidence?.length||!findings?.length)return request;
  const protectedIds=new Set<string>(),supportedIds=new Set<string>(),firstByKind=new Set<string>();
  for(const finding of findings){
    const record=finding as {kind?:unknown;status?:unknown;evidenceIds?:unknown};
    const ids=Array.isArray(record.evidenceIds)?record.evidenceIds.filter((id):id is string=>typeof id==="string"):[];
    if(record.status!=="supported")for(const id of ids)protectedIds.add(id);
    else for(const id of ids)supportedIds.add(id);
    const kind=typeof record.kind==="string"?record.kind:"unknown";
    if(!firstByKind.has(kind)&&ids.length){protectedIds.add(ids[0]);firstByKind.add(kind);}
  }
  const candidates=evidence.map((item,index)=>({index,id:item.evidenceId,
    length:typeof item.excerpt==="string"?Buffer.byteLength(item.excerpt,"utf8"):0}))
    .filter(item=>typeof item.id==="string"&&supportedIds.has(item.id)
      &&!protectedIds.has(item.id)&&item.length>96)
    .sort((left,right)=>right.length-left.length||left.index-right.index);
  if(!candidates.length)return request;
  const folded=evidence.map(item=>({...item}));
  const instructions=[...input.instructions,
    "Some raw excerpts for correction-stage supported findings are folded to meet the request limit. Every corrected finding, status, evidence ID, title and URL remains. A folded excerpt is not independent corroboration or a negative fact. Use only stated findings and visible source text; if omitted raw wording could change a gate or score, mark it unknown and request review. Never invent missing source content."];
  let current=request,omitted=0;
  for(const item of candidates){
    folded[item.index]={...folded[item.index],excerpt:"[folded supported-fact excerpt]",excerptFolded:true};
    omitted++;
    current={...request,input:{...input,instructions,candidates:[{...candidate,evidence:folded}],
      evidenceExcerptEncoding:"supported-excerpt-fold-v1"}} as T;
    if(requestBytes(current)<=limit)break;
  }
  if(!omitted||requestBytes(current)>=requestBytes(request))return request;
  return {...current,preparation:{encoding:"supported-excerpt-fold-v1",
    originalMaximumWireBytes:requestBytes(request),preparedMaximumWireBytes:requestBytes(current),
    evidenceItems:evidence.length,findingItems:findings.length,omittedEvidenceExcerpts:omitted}};
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
      (value.input as Record<string, unknown>).candidateTableEncoding,
      (value.input as Record<string, unknown>).sharedPhraseEncoding].filter(Boolean).join("+"),
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
  const phrased = compactSharedPhrases(smallest, requestBytes, limit);
  if (requestBytes(phrased) < requestBytes(smallest)) smallest = phrased;
  if(requestBytes(smallest)<=limit)return finish(smallest);
  let folded=foldSupportedExcerpts(request,requestBytes,limit);
  if(folded!==request&&requestBytes(folded)>limit){
    const foldedInput=folded.input as {candidates:CandidateInput[];instructions:string[]};
    const foldedCandidate=foldedInput.candidates[0];
    const uniform={...folded,input:{...foldedInput,candidates:[{...foldedCandidate,
      evidence:foldedCandidate.evidence?.map(item=>({...item,excerptFolded:item.excerptFolded===true}))}]}} as T;
    const tabled=compactFieldTables(uniform);
    const phrased=compactSharedPhrases(tabled,requestBytes,limit);
    const best=[folded,tabled,phrased].sort((left,right)=>requestBytes(left)-requestBytes(right))[0];
    if(best!==folded)folded={...best,preparation:{...folded.preparation,
      encoding:["supported-excerpt-fold-v1",
        (best.input as Record<string,unknown>).candidateTableEncoding,
        (best.input as Record<string,unknown>).sharedPhraseEncoding].filter(Boolean).join("+"),
      preparedMaximumWireBytes:requestBytes(best)}};
  }
  if(requestBytes(folded)<requestBytes(smallest))smallest=folded;
  return smallest===folded?folded:finish(smallest);
}
