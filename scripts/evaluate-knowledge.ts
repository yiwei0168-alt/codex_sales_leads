import { buildKnowledgeEvaluationCorpus, knowledgeEvaluationCorpusHash } from "../src/lib/knowledge/evaluation/corpus";
import { interpretAssistantRequest } from "../src/lib/assistant/intent";
import { extractStructuredProductFacts } from "../src/lib/rag/product-facts";
import { chunkDocument, chunkDocumentV2 } from "../src/lib/rag/chunker";
import { classifyKnowledgeRequest } from "../src/lib/knowledge/request";
import { exactModelMentions } from "../src/lib/knowledge/query-normalizer";

if (process.argv.includes("--live")) {
  throw new Error("The offline evaluator does not authorize live model/search calls");
}

const corpus = buildKnowledgeEvaluationCorpus();
const routedAsKnowledge = corpus.cases.filter((item) => interpretAssistantRequest(item.query).intent === "knowledge-question").length;
const entityDictionary = [...new Set(corpus.cases.flatMap((item) => item.expectedEntities))];
const closedLoopRoutes = corpus.cases.map((item) => {
  const entityKeys = exactModelMentions(item.query, entityDictionary);
  const parsed = classifyKnowledgeRequest({ question: item.query, entityKeys, entry: "knowledge-page" });
  return {
    id: item.id,
    expectedAction: item.expectedAction,
    actualAction: parsed.action,
    actionMatch: parsed.action === item.expectedAction,
    entityMatch: JSON.stringify([...parsed.entityKeys].sort()) === JSON.stringify([...item.expectedEntities].sort()),
  };
});
const baseRoutes = closedLoopRoutes.filter((route) => corpus.cases.find((item) => item.id === route.id)?.group === "base");
const wrRegression = closedLoopRoutes.find((route) => route.id === "base-15-compare");

function facts(description: string) {
  return extractStructuredProductFacts({
    model: "AUDIT-SYNTHETIC", productName: "Synthetic fixture", category: "Synthetic fixture",
    brand: "Synthetic", lifecycleStatus: "unknown", description,
  }).filter((item) => item.factGroup !== "identity").map((item) => `${item.factKey}:${item.factValue}`);
}

const probes = [
  { id: "unit-2.5g-not-cellular", actual: facts("1 x 2.5G RJ45 Port"), forbidden: "cellular_generation:5G" },
  { id: "sfp-plus-preserved", actual: facts("SFP+ port"), required: "interface_type:SFP+" },
  { id: "negated-capabilities-not-positive", actual: facts("No PoE support. Does not support WPA3."), forbidden: "poe_capability:PoE" },
  { id: "compound-poe-standard-and-budget", actual: facts("802.3af/at PoE, 120W budget"), required: "poe_standard:802.3at" },
].map((probe) => ({
  ...probe,
  knownDefectObserved: probe.forbidden ? probe.actual.includes(probe.forbidden) : !probe.actual.includes(probe.required!),
}));

const chunks = chunkDocument(`# Alpha\n\n${"A".repeat(100)}\n\n## Beta\n\nImportant short fact.`);
const headingDefectObserved = chunks.some((chunk) => chunk.content.includes("Important short fact")
  && !chunk.headingPath.includes("Beta"));
const v2HeadingFixed = chunkDocumentV2([
  { id:"alpha",unitType:"document",unitIndex:1,section:"Alpha",blockType:"paragraph",text:"A".repeat(100),extractorVersion:"layout-v2.0.0",quality:"success" },
  { id:"beta",unitType:"document",unitIndex:1,section:"Beta",blockType:"paragraph",text:"Important short fact.",extractorVersion:"layout-v2.0.0",quality:"success" },
]).some((chunk)=>chunk.content.includes("Important short fact")&&chunk.headingPath.includes("Beta"));
const report = {
  mode: "offline",
  corpus: {
    version: corpus.version,
    sha256: knowledgeEvaluationCorpusHash(corpus),
    total: corpus.cases.length,
    base: corpus.cases.filter((item) => item.group === "base").length,
    boundary: corpus.cases.filter((item) => item.group === "boundary").length,
    entities: new Set(corpus.cases.flatMap((item) => item.expectedEntities)).size,
    splits: Object.fromEntries(["development", "validation", "holdout"].map((split) => [
      split, corpus.cases.filter((item) => item.split === split).length,
    ])),
    humanAnswerReviewed: corpus.cases.filter((item) => item.goldStatus === "pending-human-answer-review"
      && item.expectedAnswer && item.expectedSources?.length).length,
  },
  currentBaseline: {
    topLevelKnowledgeRoutes: routedAsKnowledge,
    topLevelKnowledgeRouteRate: routedAsKnowledge / corpus.cases.length,
    factExtractionProbes: probes,
    shortSectionHeadingDefectObserved: headingDefectObserved,
    shadowV2ShortSectionFixed: v2HeadingFixed,
    parsedKnowledgeActionMatches: closedLoopRoutes.filter((item) => item.actionMatch).length,
    parsedEntityMatches: closedLoopRoutes.filter((item) => item.entityMatch).length,
    baseActionMatches: baseRoutes.filter((item) => item.actionMatch).length,
    baseEntityMatches: baseRoutes.filter((item) => item.entityMatch).length,
    wr3000Wr6500hRegression: wrRegression,
    routeMismatches: closedLoopRoutes.filter((item) => !item.actionMatch || !item.entityMatch).slice(0, 20),
  },
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
  interpretation: "R0 executes deterministic knowledge action/entity parsing for the frozen corpus. Answer/source gold remains pending human review, so this is not retrieval, answer, citation, or Recall@8 acceptance.",
};

if (corpus.cases.length !== 300 || baseRoutes.some((item) => !item.actionMatch || !item.entityMatch)
  || !wrRegression?.actionMatch || !wrRegression.entityMatch
  || probes.some((item) => item.knownDefectObserved) || !headingDefectObserved || !v2HeadingFixed) {
  throw new Error(`P1 extraction gate failed: ${JSON.stringify(report)}`);
}
console.log(JSON.stringify(report, null, 2));
