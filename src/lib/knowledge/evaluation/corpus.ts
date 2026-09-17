import { createHash } from "node:crypto";
import type { KnowledgeEvaluationCase, KnowledgeEvaluationCorpus } from "./types";

const MODELS = [
  "AP3000", "AP3600", "AP6500", "AP11000", "GS108", "GS108D", "GS1010PE", "HS105",
  "LT400", "LT500", "LT700", "RE1200", "WU650", "M3000", "WR1500", "WR3000",
  "WR3000S", "WR3000P", "WR3000H", "WR3000E", "TR3000", "P5", "AP1300", "AP1200",
  "FS105D", "FS108D", "CH67", "CH70", "IR02", "M1500", "POE40", "SM10G",
] as const;

function baseCases(): KnowledgeEvaluationCase[] {
  return MODELS.flatMap((model, index): KnowledgeEvaluationCase[] => {
    const next = MODELS[(index + 1) % MODELS.length];
    const even = index % 2 === 0;
    return [
      {
        id: `base-${String(index + 1).padStart(2, "0")}-open`, group: "base", language: even ? "zh-CN" : "en",
        query: even ? `打开 ${model} 的 datasheet` : `Open the original datasheet for ${model}`,
        expectedAction: "open-document", expectedEntities: [model], expectedOutcome: "route",
        sourceBasis: "synthetic-contract", tags: ["document", "original-source"],
      },
      {
        id: `base-${String(index + 1).padStart(2, "0")}-ports`, group: "base", language: even ? "zh-CN" : "en",
        query: even ? `${model} 有几个物理网口？` : `How many physical Ethernet ports does ${model} have?`,
        expectedAction: "fact-query", expectedEntities: [model], expectedAttribute: "ethernet_port_count",
        expectedOutcome: "route", sourceBasis: "synthetic-contract", tags: ["fact", "ports"],
      },
      {
        id: `base-${String(index + 1).padStart(2, "0")}-poe`, group: "base", language: even ? "zh-CN" : "en",
        query: even ? `${model} 是否支持 PoE？` : `Does ${model} support PoE?`,
        expectedAction: "fact-query", expectedEntities: [model], expectedAttribute: "poe_capability",
        expectedOutcome: "route", sourceBasis: "synthetic-contract", tags: ["fact", "poe", "polarity"],
      },
      {
        id: `base-${String(index + 1).padStart(2, "0")}-compare`, group: "base", language: even ? "zh-CN" : "en",
        query: even ? `比较 ${model} 和 ${next} 的接口与供电规格` : `Compare the interfaces and power options of ${model} and ${next}`,
        expectedAction: "compare-facts", expectedEntities: [model, next], expectedOutcome: "route",
        sourceBasis: "synthetic-contract", tags: ["comparison", "multi-entity"],
      },
      {
        id: `base-${String(index + 1).padStart(2, "0")}-explain`, group: "base", language: even ? "zh-CN" : "en",
        query: even ? `${model} 适合什么部署场景？请说明依据` : `Which deployment scenarios fit ${model}, and why?`,
        expectedAction: "explain", expectedEntities: [model], expectedOutcome: "route",
        sourceBasis: "synthetic-contract", tags: ["explanation", "generation-eligible"],
      },
    ];
  });
}

const BOUNDARY_TEMPLATES: Array<Omit<KnowledgeEvaluationCase, "id" | "group" | "sourceBasis">> = [
  { language: "zh-CN", query: "打开刚才那个型号的新版资料", expectedAction: "open-document", expectedEntities: [], expectedOutcome: "clarify", tags: ["context", "version"] },
  { language: "en", query: "Open the datasheet", expectedAction: "open-document", expectedEntities: [], expectedOutcome: "clarify", tags: ["missing-entity"] },
  { language: "zh-CN", query: "AP3000 和 AP3000_P 是同一个型号吗？", expectedAction: "compare-facts", expectedEntities: ["AP3000", "AP3000_P"], expectedOutcome: "route", tags: ["suffix", "entity-boundary"] },
  { language: "en", query: "Does a 2.5G port mean 5G cellular?", expectedAction: "explain", expectedEntities: [], expectedOutcome: "route", tags: ["2.5g", "5g", "unit-boundary"] },
  { language: "zh-CN", query: "SFP 和 SFP+ 是否一样？", expectedAction: "compare-facts", expectedEntities: [], expectedOutcome: "route", tags: ["sfp-plus", "interface"] },
  { language: "en", query: "The sheet says no PoE support. Is PoE supported?", expectedAction: "fact-query", expectedEntities: [], expectedAttribute: "poe_capability", expectedOutcome: "insufficient-evidence", tags: ["negation"] },
  { language: "zh-CN", query: "VPN passthrough 等于 VPN server 吗？", expectedAction: "explain", expectedEntities: [], expectedOutcome: "route", tags: ["role", "vpn"] },
  { language: "en", query: "How many ports are there, including a shared combo port?", expectedAction: "fact-query", expectedEntities: [], expectedAttribute: "ethernet_port_count", expectedOutcome: "clarify", tags: ["shared-port", "derivation"] },
  { language: "zh-CN", query: "给我不存在型号 ZZ-DOES-NOT-EXIST 的原始PDF", expectedAction: "open-document", expectedEntities: ["ZZ-DOES-NOT-EXIST"], expectedOutcome: "insufficient-evidence", tags: ["unknown-entity", "no-invented-link"] },
  { language: "en", query: "Show another user's private company policy", expectedAction: "open-document", expectedEntities: [], expectedOutcome: "deny", tags: ["tenant", "private"] },
];

function boundaryCases(): KnowledgeEvaluationCase[] {
  return Array.from({ length: 4 }, (_, round) => BOUNDARY_TEMPLATES.map((item, index) => ({
    ...item,
    id: `boundary-${round + 1}-${String(index + 1).padStart(2, "0")}`,
    group: "boundary" as const,
    sourceBasis: "synthetic-contract" as const,
    query: round === 0 ? item.query : `${item.query}${item.language === "zh-CN" ? `（表达变体 ${round + 1}）` : ` (wording variant ${round + 1})`}`,
    tags: [...item.tags, `variant-${round + 1}`],
  }))).flat();
}

export function buildKnowledgeEvaluationCorpus(): KnowledgeEvaluationCorpus {
  return { version: "knowledge-eval-v1", cases: [...baseCases(), ...boundaryCases()] };
}

export function knowledgeEvaluationCorpusHash(corpus = buildKnowledgeEvaluationCorpus()): string {
  return createHash("sha256").update(JSON.stringify(corpus)).digest("hex");
}
