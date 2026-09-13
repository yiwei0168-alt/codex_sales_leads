import { expect, it } from "vitest";
import { compactLeadSingleton } from "./compact-lead-request";
import { leadRequestBatches } from "./lead-request-batches";
import { LeadRequestTooLargeError } from "./lead-request-bounds";
import type { StructuredAiRequest } from "./contracts";
import { deepSeekRequestBody } from "./deepseek-request";
import { DeepSeekProvider } from "./deepseek";

const text = "Networking facts with quotes \" and Unicode 界. ".repeat(80);
const request: StructuredAiRequest<unknown> = {
  task: "lead-evidence-correction", modelVersion: "deepseek-v4-flash", promptVersion: "fixture",
  evidenceIds: Array.from({ length: 20 }, (_, i) => `e${i}`),
  input: { instructions: ["Keep factual evidence"], candidates: [{ candidateId: "c1",
    findings: [{ statement: "A retained fact", evidenceIds: ["e0", "e19"] }],
    evidence: Array.from({ length: 20 }, (_, i) => ({ evidenceId: `e${i}`, url: `https://example.test/${i}`,
      sourceType: "official-website", title: "Page", excerpt: text })) }] },
};

it("losslessly compresses an oversized singleton with separate citation identities and deterministic dependencies", () => {
  const before = JSON.stringify(request);
  const compact = compactLeadSingleton(request);
  expect(compact).not.toBe(request);
  const input = compact.input as { evidenceTextDictionary: Record<string, string>;
    candidates: Array<{ findings: unknown; evidence: Array<Record<string, unknown>> }> };
  const expanded = input.candidates[0].evidence.map(item => {
    const copy = { ...item };
    for (const field of ["title", "excerpt"]) if (copy[`${field}TextRef`]) {
      copy[field] = input.evidenceTextDictionary[String(copy[`${field}TextRef`])];
      delete copy[`${field}TextRef`];
    }
    return copy;
  });
  const original = request.input as typeof input;
  expect(expanded).toEqual(original.candidates[0].evidence);
  expect(input.candidates[0].findings).toEqual(original.candidates[0].findings);
  expect(compact.evidenceIds).toEqual(request.evidenceIds);
  expect(JSON.stringify(request)).toBe(before);
  expect(compactLeadSingleton(request)).toEqual(compact);
  expect(leadRequestBatches(["c1"], () => compact, 5, 100000)).toEqual([["c1"]]);
});

it("leaves normal batches untouched and never truncates uncompressible evidence", () => {
  const small = { ...request, input: { instructions: [], candidates: [{ evidence: [{ excerpt: "small" }] }] } };
  expect(compactLeadSingleton(small)).toBe(small);
  const unique = { ...request, input: { instructions: [], candidates: [{ evidence: [{ excerpt: text.repeat(30) }] }] } };
  expect(compactLeadSingleton(unique)).toBe(unique);
  expect(() => leadRequestBatches(["c1"], () => compactLeadSingleton(unique), 5, 100000))
    .toThrow(LeadRequestTooLargeError);
});

it("fits unique evidence and findings with lossless field tables across real wire and cache identities", async () => {
  const evidence = Array.from({length:100},(_,i)=>({evidenceId:`e${i}`,sourceType:"official-website",
    url:`https://example.test/${i}`,title:`Unique page ${i}`,excerpt:`Unique fact ${i}: Unicode 界 and escaped \"quotes\".`,capturedAt:null}));
  const findings = evidence.map((item,i)=>({findingId:`f${i}`,statement:`Unique conclusion ${i}`,status:i%2?"unknown":"supported",
    evidenceIds:[item.evidenceId],notes:["Keep this qualification"],roles:[],nested:{nullable:null,enabled:false}}));
  const base={...request,input:{instructions:["Original task instructions"],candidates:[{candidateId:"c1",evidence,findings}]}};
  // Cross the real request limit by a fixed amount without adding duplicate evidence text.
  const baseBytes=Buffer.byteLength(deepSeekRequestBody(base).body,"utf8");
  const unique={...base,input:{...base.input,instructions:[...base.input.instructions,"p".repeat(Math.max(0,37000-baseBytes))]}};
  const before=JSON.stringify(unique);
  const provider=new DeepSeekProvider({apiKey:"fixture",maxAttempts:1,fetchImplementation:async(_url,init)=>{
    expect(init?.body).toBe(deepSeekRequestBody(compact).body);
    return Response.json({choices:[{finish_reason:"stop",message:{content:"{}"}}]});
  }});
  const compact=compactLeadSingleton(unique,provider.requestBytes.bind(provider));
  expect(provider.requestBytes(unique)).toBeGreaterThan(36864);
  expect(provider.requestBytes(compact)).toBeLessThanOrEqual(36864);
  expect(compact.preparation).toEqual({encoding:"exact-field-table-v1",originalMaximumWireBytes:provider.requestBytes(unique),
    preparedMaximumWireBytes:provider.requestBytes(compact),evidenceItems:100,findingItems:100});
  expect(deepSeekRequestBody(compact).body).not.toContain("originalMaximumWireBytes");
  const input=compact.input as unknown as {candidateTableEncoding:string;instructions:string[];candidates:Array<Record<string,{columns:string[];rows:unknown[][]}>>};
  expect(input.candidateTableEncoding).toBe("exact-field-table-v1");
  for(const [field,original] of [["evidence",evidence],["findings",findings]] as const){
    const table=input.candidates[0][`${field}Table`];
    const decoded=table.rows.map(row=>Object.fromEntries(table.columns.map((column,i)=>[column,row[i]])));
    expect(decoded).toEqual(original);
  }
  expect(input.instructions.slice(0,unique.input.instructions.length)).toEqual(unique.input.instructions);
  expect(compact.evidenceIds).toEqual(unique.evidenceIds);
  expect(compact.outputSchema).toEqual(unique.outputSchema);
  expect(JSON.stringify(unique)).toBe(before);
  expect(compactLeadSingleton(compact)).toBe(compact);
  expect(provider.cacheIdentity(compact)).not.toBe(provider.cacheIdentity(unique));
  const changed=structuredClone(unique);changed.input.candidates[0].findings[0].statement="Changed fact";
  expect(provider.cacheIdentity(compactLeadSingleton(changed))).not.toBe(provider.cacheIdentity(compact));
  await provider.execute(compact);
});

it("does not collapse absent fields into null or overwrite existing table metadata",()=>{
  const evidence=[{excerpt:text.repeat(30),optional:null},{excerpt:"short"}];
  const heterogeneous={...request,input:{instructions:[],candidates:[{evidence}]}};
  expect(compactLeadSingleton(heterogeneous)).toBe(heterogeneous);
  const occupied={...request,input:{instructions:[],candidates:[{evidence:[{excerpt:text.repeat(30)},{excerpt:"unique"}],evidenceTable:{keep:true}}]}};
  expect(compactLeadSingleton(occupied)).toBe(occupied);
});
