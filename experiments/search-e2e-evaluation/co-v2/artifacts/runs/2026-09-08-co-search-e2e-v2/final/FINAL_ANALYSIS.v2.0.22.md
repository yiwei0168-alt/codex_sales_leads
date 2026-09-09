# Colombia formal search E2E evaluation — final analysis v2.0.22

Frozen run: `2026-09-08-co-search-e2e-v2`. Scope: Colombia; Retail/E-tail, Distributor/VAD, SI/MSP and Reseller/VAR; 50 requested slots per arm/category. Cooperation paths, strategy, contacts and email generation were excluded.

## Executive conclusion

The Product workflow produced much higher measured lead value than one untuned Gemini Full search in every category, but the complete preregistered hypothesis did **not** pass because independent blind calibration rejected role and company-level score consistency.

- Macro Slot Utility@50: Product **13.08**, Gemini **3.28**, delta **+9.80**.
- Product won **4/4** categories; bootstrap 95% interval **[6.31, 13.51]**.
- All six search-outcome gates passed. The blind-audit gate failed.
- The result supports the hybrid search strategy's relative discovery value in Colombia, but does not validate the complete search + evidence + role + score ranking pipeline.

## Category results

| Category | Gemini utility | Product utility | Delta | Gemini valid | Product valid | Product search output |
|---|---:|---:|---:|---:|---:|---:|
| Retail/E-tail | 3.30 | 17.96 | +14.66 | 3 | 14 | 14/50 |
| Distributor/VAD | 4.54 | 19.76 | +15.22 | 3 | 13 | 13/50 |
| SI/MSP | 3.94 | 5.16 | +1.22 | 3 | 4 | 5/50 |
| Reseller/VAR | 1.34 | 9.44 | +8.10 | 1 | 7 | 7/50 |
| **Macro/total** | **3.28** | **13.08** | **+9.80** | **10** | **38** | **39/200** |

Product returned fewer names than Gemini (39 versus 60) but many more evaluated-valid leads (38 versus 10). Absolute coverage is still poor for an explicit 50-company request: Product filled only 19.5% of slots. SI/MSP and Reseller/VAR are the largest recall/role-resolution gaps.

## Frozen win gates

| Gate | Actual | Threshold | Result |
|---|---:|---:|---|
| Macro gain | +9.80 | ≥5 | PASS |
| Categories won | 4 | ≥3 | PASS |
| Worst market | +9.80 | ≥-3 | PASS |
| Worst category | +1.22 | ≥-5 | PASS |
| Unique high-value advantage | +5 | ≥1 | PASS |
| Bootstrap lower bound | +6.31 | >0 | PASS |
| Blind calibration | false | true | **FAIL** |

## Blind audit

Claude Opus 5 and OpenAI GPT-5.6-sol reviewed 24 representative and eight stress packets with arm, provider, rank and original score hidden. DeepSeek Pro handled conditional arbitration; four bounded failures used the disclosed in-conversation Codex fallback.

| Representative metric | Actual | Gate | Result |
|---|---:|---:|---|
| Role-family agreement | 75.0% | ≥90% | FAIL |
| Qualified-status agreement | 66.7% | ≥90% | FAIL |
| Within-category macro Spearman | 0.285 | ≥0.70 | FAIL |
| Absolute mean bias | 0.96 | ≤5 | PASS |
| Mean absolute error | 11.54 | ≤8 | FAIL |
| Citation ID alignment | 100% | ≥98% | PASS |
| Citation entailment | 94.1% | ≥90% | PASS |

Mean bias is close to zero while MAE is high. The workflow is not merely generous or conservative; it makes large company-level errors in both directions that cancel in aggregate. Examples: Q&C Ingenieria 68 versus blind 36; Help Soluciones 43 versus 68; Gestión de Compras Empresariales 66 versus 43; Tienda Maitek 83 versus 61; Clones y Periféricos 22 versus 49; Kuars 42 versus 62. Individual ranking and threshold decisions are therefore unstable.

The first report showed 16.7% role-family agreement because valid family labels such as `retail` and `services` were treated as unknown. v2.0.21 fixed that parser and raised agreement to 75.0%. The remaining gap is substantive: role correction still leaves supported service firms unresolved and sometimes differs from the panel between distribution and resale.

Arbitration occurred on 27/32 packets (84.4%), above the 35% warning. Shared score anchors need tightening in the next evaluation, but the frozen threshold must not be relaxed post hoc.

## Cost and runtime

- Hard cap **$50**; final budget cost **$27.1385 (54.3%)**; official-list-price total **$27.2054**; no unpriced event.
- $10 and $20 reviews fired and passed. Completion occurred before the $30/60% checkpoint.
- Product **$20.5374 (75.7%)**; evaluation **$5.8903 (21.7%)**; Gemini **$0.7109 (2.6%)**.
- Unit cost: **$0.06785/requested slot**, **$0.27413/returned candidate**, **$0.56539/evaluated-valid candidate**. Product-only cost: **$0.52660/returned**, **$0.54046/Product-valid**.
- Product wall time **180.78 minutes** versus Gemini **1.33 minutes**. Time was not a gate but amplified recovery risk.

Hybrid discovery ($10.214), first evidence ($5.944) and correction evidence ($3.552) totaled **$19.710, 96.0% of Product cost**. Cost optimization should improve pre-evidence role precision, provider activation and evidence reuse before lowering model capability.

Blind evaluation spent $4.0608 on judges and $0.8952 on arbitration. Five invalid judge and 32 invalid arbitrator events cost about **$0.8144**, 16.4% of blind model spend. Initial prompts should require materially shorter reasons/citations; ledger-aware repair now prevents unlimited repeats.

One response-body timeout had no provider receipt and is conservatively represented as 4,857 input + 8,192 output tokens at official price ($0.00924), not zero or account-observed. The v2.0.22 recomputation unexpectedly needed one missing DeepSeek arbitration because a legacy key contained a derived role field; initial plus repair cost $0.028999 and remains disclosed.

## Discovery-provider contribution

| Provider | Cost | New unique | Fractional final credit | Cost/final credit | Observation |
|---|---:|---:|---:|---:|---|
| Brave | $0.550 | 206 | 16.5 | $0.033 | Best value; 87.5% duplicate ratio. |
| Gemini Full | $5.754 | 226 | 12.5 | $0.460 | Expensive but important in Distribution and Resale. |
| Exa | $2.117 | 142 | 5.0 | $0.423 | Useful in Distribution/SI; zero Retail/Resale final credit. |
| Google Places | $1.505 | 45 | 5.0 | $0.301 | Valuable in Retail only in this run. |
| SearchAPI | $0.288 | 0 | 0 | n/a | Monthly quota unavailable; no value. |

Category evidence argues against one global provider rule:

- Retail: Brave 8.5 and Places 5.0 fractional finals; Gemini 0.5; Exa 0. Make Exa conditional after core-route marginal yield.
- Distribution: Brave 5, Gemini 5 and Exa 3. All contributed; removing Gemini would materially reduce output.
- SI/MSP: Gemini 2, Exa 2, Brave 1, Places 0. Role precision, not raw recall, is limiting.
- Reseller/VAR: Gemini 5 and Brave 2; Exa and Places 0. Retain Gemini fallback, coalesce duplicate semantic tracks and gate later calls on downstream-qualified yield.

These are single-market observations, not global removals. Production decisions must use accumulated market × category contribution, final downstream usage and cost, not Top-N alone.

## Prioritized changes

### P0 — role and score calibration

1. Split `primaryRoleFamily` and `primaryRoleSubtype` into explicit enums; never infer family from unconstrained text.
2. Pass cached search-stage role findings into correction/scoring. Store prior role, corrected role, cited finding IDs and change reason for every override.
3. Add role-specific observable score anchors and deterministic caps. Models produce semantic findings/sub-scores; code computes totals, gates and status.
4. Build a regression set from the largest blind disagreements and re-score frozen evidence before another paid search experiment.
5. Preserve the current citation mechanism; alignment and entailment passed.

### P0 — recall and provider control

1. Persist provider quota/health within a task. A confirmed monthly SearchAPI outage opens one auditable circuit until explicit refresh.
2. A persistently failed but fully covered route must not reset no-final exhaustion.
3. Feed cross-track discovered domains back before the next provider call; Brave had 1,444 duplicate hits and Gemini 306.
4. Use market × category activation: Brave-first broadly; Places for local Retail; Gemini where marginal finals justify it; Exa conditional in Retail/Resale and retained in Distribution/SI.
5. Stop on downstream-qualified marginal yield, not raw unique count or Top-N.

### P1 — evidence and evaluation cost

1. Apply a cheap evidence-sufficiency/role gate before Tavily; search/evidence was 96% of Product cost.
2. Cache official reads, required supplements and corrections by company, evidence version and policy version; downstream scoring consumes the exact record before requesting more evidence.
3. Keep ledger-aware one-time schema repair and direct-to-repair resume.
4. Shorten judge outputs to one compact claim/citation per necessary signal to avoid 4,096-token truncation.
5. Separate logical requested model, provider route and response model in cache identity. Derived fields must not invalidate purchased output.

## Final decision

This is a **search-outcome win but a formal E2E no-pass**. Continue the hybrid search with targeted route optimization, but do not declare the role/scoring mechanism validated. First run a no-new-search calibration on the frozen Colombia evidence and require better role agreement, Spearman and MAE. A new market search should follow only after the ranking yardstick is stable.
