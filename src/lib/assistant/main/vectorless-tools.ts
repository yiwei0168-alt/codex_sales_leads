import {z} from "zod";
import {aggregateSessionDocuments,browseSessionTree,filterSessionDocuments,readSessionEvidence,
  searchSessionDocuments,startVectorlessSession,supplementSessionFromV3} from "@/lib/knowledge/vectorless-session";
import {result} from "./contracts";
import {defineTool} from "./tool-definition";

const sessionId=z.uuid();
const documentId=z.uuid();
const documentIds=z.array(documentId).max(24);
const scope=z.object({market:z.string().max(120).optional(),companyId:z.string().max(180).optional(),
  productId:z.string().max(180).optional()}).strict();

/** Read-only answer evidence; session and step receipts are persisted for shadow comparison. */
export const vectorlessTools=[
  defineTool({id:"vectorless_start",description:"Start one shadow retrieval session for the exact user question. Search before browsing; summaries and candidate titles are navigation only, never answer citations.",
    input:z.object({question:z.string().trim().min(2).max(4000)}).strict(),
    execute:async(i,c)=>result({sessionId:await startVectorlessSession(c.userId,i.question)})}),
  defineTool({id:"vectorless_search",description:"Find up to 24 current accessible documents in a shadow session, with matching reasons. Search only once per session and report any unsearched range.",
    input:z.object({sessionId,filters:scope.default({})}).strict(),
    execute:async(i,c)=>result(await searchSessionDocuments(c.userId,i.sessionId,i.filters))}),
  defineTool({id:"vectorless_browse",description:"Browse the current tree of one candidate document. A summary is only a navigation hint. Navigation and set operations share an eight-step budget.",
    input:z.object({sessionId,documentId,parentId:z.uuid().nullable().default(null)}).strict(),
    execute:async(i,c)=>result(await browseSessionTree(c.userId,i.sessionId,i.documentId,i.parentId))}),
  defineTool({id:"vectorless_read",description:"Read one current original evidence block with stable source coordinates and account/version revalidation. Only this raw evidence may support a citation; eight reads per session maximum.",
    input:z.object({sessionId,nodeId:z.uuid()}).strict(),
    execute:async(i,c)=>result(await readSessionEvidence(c.userId,i.sessionId,i.nodeId))}),
  defineTool({id:"vectorless_aggregate",description:"Deterministically count an authorized subset of candidate documents. The model must not invent a count; this consumes one navigation step.",
    input:z.object({sessionId,documentIds}).strict(),
    execute:async(i,c)=>result(await aggregateSessionDocuments(c.userId,i.sessionId,i.documentIds))}),
  defineTool({id:"vectorless_filter",description:"Deterministically filter authorized candidate documents by saved fields or capture dates. This consumes one navigation step.",
    input:z.object({sessionId,documentIds,filters:scope.extend({collection:z.string().max(80).optional(),
      capturedFrom:z.iso.datetime().optional(),capturedBefore:z.iso.datetime().optional()}).strict()}).strict(),
    execute:async(i,c)=>result(await filterSessionDocuments(c.userId,i.sessionId,i.documentIds,i.filters))}),
  defineTool({id:"vectorless_v3_candidates",description:"When shadow search lacks evidence, ask the active v3 index once for extra document IDs. Returned chunks are never answer evidence; reread current originals.",
    input:z.object({sessionId}).strict(),
    execute:async(i,c)=>result(await supplementSessionFromV3(c.userId,i.sessionId))}),
];
