import { buildKnowledgeEvaluationCorpus, knowledgeEvaluationCorpusHash } from "../src/lib/knowledge/evaluation/corpus";
import { interpretAssistantRequest } from "../src/lib/assistant/intent";
import { extractStructuredProductFacts } from "../src/lib/rag/product-facts";
import { chunkDocument } from "../src/lib/rag/chunker";

if (process.argv.includes("--live")) {
  throw new Error("P0 does not authorize live model/search evaluation; use the later bounded live harness after offline acceptance");
}

const corpus = buildKnowledgeEvaluationCorpus();
const routedAsKnowledge = corpus.cases.filter((item) => interpretAssistantRequest(item.query).intent === "knowledge-question").length;

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
const report = {
  mode: "offline",
  corpus: {
    version: corpus.version,
    sha256: knowledgeEvaluationCorpusHash(corpus),
    total: corpus.cases.length,
    base: corpus.cases.filter((item) => item.group === "base").length,
    boundary: corpus.cases.filter((item) => item.group === "boundary").length,
    entities: new Set(corpus.cases.flatMap((item) => item.expectedEntities)).size,
  },
  currentBaseline: {
    topLevelKnowledgeRoutes: routedAsKnowledge,
    topLevelKnowledgeRouteRate: routedAsKnowledge / corpus.cases.length,
    factExtractionProbes: probes,
    shortSectionHeadingDefectObserved: headingDefectObserved,
  },
  externalCalls: { model: 0, embedding: 0, search: 0, smtp: 0 },
  interpretation: "Known defects are expected in P0 and become regression requirements for later phases.",
};

if (corpus.cases.length !== 200 || probes.some((item) => !item.knownDefectObserved) || !headingDefectObserved) {
  throw new Error(`P0 baseline drifted unexpectedly: ${JSON.stringify(report)}`);
}
console.log(JSON.stringify(report, null, 2));
