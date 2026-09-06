# Cudy UK/Mexico search E2E post-run audit v1.0.16

This is a deterministic, read-only audit of the completed v1.1.6 run. It does not alter frozen candidates, scores, blind decisions or win gates.

## Final conclusion

The product scoring pipeline reported a +22.69 Macro Slot Utility@30 advantage and won 7/8 cells, but the formal outcome remains **inconclusive** because the independent 64-company blind calibration failed. Exact primary-role agreement was 60.9%, qualified-status agreement 70.3%, Spearman 0.691, MAE 10.75 and citation alignment 100%. The product therefore has a strong discovery signal, but the current scoring output is not calibrated well enough to prove superiority over Gemini.

## Corrected discovery-provider attribution

The v1.0.15 generated report's zero-credit table is invalid. Its reporter read `raw.corrected.candidates`, while the actual value is an array; three reused cells also intentionally omit raw payloads. This audit resolves those three cells to their frozen source runs and requires all 200 final product companies to have provenance. Fractional credit sums to 200.

| Provider | Requests | Raw | New unique | Duplicate hits | Fractional final credit | Credit/new unique | Productive discovery cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| brave | 55 | 994 | 240 | 744 | 77.50 | 32.3% | $0.275000 |
| gemini-full | 10 | 166 | 113 | 53 | 44.00 | 38.9% | $1.008000 |
| exa | 28 | 219 | 174 | 45 | 27.00 | 15.5% | $0.506000 |
| google-places | 22 | 203 | 143 | 60 | 27.00 | 18.9% | $0.770000 |
| searchapi | 105 | 417 | 135 | 263 | 24.50 | 18.1% | $0.420000 |

No provider should be removed from the zero-credit output. Brave contributed the most final candidates, while Gemini Full had the highest final-credit/new-unique rate among the national/semantic routes. SearchAPI had material final contribution despite repeated timeout waste.

## Blind-calibration diagnosis

| Cell | N | Exact role | Role family | Qualified status | MAE | Bias |
|---|---:|---:|---:|---:|---:|---:|
| MX-retail | 8 | 12.5% | 75.0% | 62.5% | 14.9 | 3.4 |
| GB-distribution | 8 | 62.5% | 87.5% | 50.0% | 12.4 | 1.4 |
| MX-si-msp | 8 | 87.5% | 87.5% | 75.0% | 8.6 | 1.1 |
| GB-resale | 8 | 87.5% | 100.0% | 100.0% | 9.5 | 3.5 |
| MX-distribution | 8 | 75.0% | 100.0% | 87.5% | 6.5 | 4.5 |
| GB-retail | 8 | 25.0% | 50.0% | 37.5% | 14.9 | -4.1 |
| MX-resale | 8 | 62.5% | 75.0% | 62.5% | 8.9 | 4.9 |
| GB-si-msp | 8 | 75.0% | 87.5% | 87.5% | 10.4 | 8.6 |

Role-family agreement was 82.8%, higher than exact-role agreement because seven Retailer→E-tailer and four Distributor→VAD differences are subtype disagreements inside the requested category. Future experiments should keep exact subtype accuracy as a diagnostic, but use role-family/category agreement as the primary search-quality gate. This does not excuse true family errors such as brand-owned stores, ISPs, directories and overused Hybrid labels. GB Retail and MX Retail are the priority calibration cells.

## Cost and v2.0 comparison

The total experiment spend was $24.922309, including failed/invalidated attempts and shared evaluation. The eight productive product cell executions cost $15.409182 for 200 final outputs: **$0.077046 per final product lead**. Because blind calibration failed, this is an output-unit cost rather than a verified-good-lead cost.

Using the frozen official rate card, the v2.0 207-company evidence+correction+scoring baseline cost is estimated at $9.689593: $4.121593 DeepSeek plus $5.568000 for 696 Tavily credits, or $0.046810 per preselected company. In the current productive runs, model cost per final output fell 66.0%, and Tavily credits per corrected candidate fell 33.1%. However, model+Tavily cost per final output was 32.2% higher than v2.0 because cold-start search sent many wrong-role or weak candidates into evidence collection. The optimization is therefore successful at the model and per-corrected-candidate levels, but not yet at end-to-end cost per accepted output.

## Required product actions

1. Fix domain sanitation and reject public-suffix-only identities before any paid stage.
2. Tighten the light gate for directories, direct brand stores, ISPs and unrelated retailers, and require requested-category business action before paid evidence.
3. Reduce Hybrid use: multiple supported roles do not prove co-primary business families; subtype definitions must explicitly distinguish Distributor/VAD, Reseller/VAR and Retailer/E-tailer.
4. Treat product assortment and target-market operating status as evidence gates; stale insolvency or administration evidence should trigger a current-status warning and user-selectable revalidation, not silent acceptance.
5. Keep SearchAPI because it contributed 24.5 final credits, but move repeated timeout routes to an every-other-round bounded recovery probe.
6. Fix stage-volume attribution so aggregate output is assigned once rather than copied to every model usage event.
7. Persist first-pass evidence gaps, supplementation and role-correction provenance in the evidence/role caches so downstream agents do not repeat work.

## Runtime boundary

Gemini summed wall time was 4.52 minutes and Product E2E 120.58 minutes. Runtime was recorded but was not a win gate, as preregistered.
