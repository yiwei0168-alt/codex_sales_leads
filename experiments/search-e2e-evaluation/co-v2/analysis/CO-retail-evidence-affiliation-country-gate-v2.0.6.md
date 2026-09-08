# CO Retail v2.0.6 evidence-affiliation and country-gate incident

The v2.0.6 search extension produced 11/50 final Product candidates at cumulative experiment cost USD 3.2347474982. The output is invalid for formal outcome comparison because evidence lineage, not just recall, was contaminated.

## Observed failure

- Historical candidate identities `com.pe` and `co.cr` were public suffixes rather than company domains. Tavily `includeDomains` therefore admitted unrelated sites across Peru and Costa Rica as official evidence.
- Correction supplementation retained search results that did not identify the candidate. PC Mérida cited another Bogotá retailer/directory page to claim Colombia presence.
- Qualification accepted its own target-country conclusion without corroborating the correction-stage country finding.
- Exa provider-profile URLs and domainless external IDs inflated normalized/new-company telemetry even though they could not become scoring candidates.
- One overlong light-gate reason invalidated a full batch, sending held records into paid evidence; model-failed rounds also advanced exhaustion.

Examples include `technology.com.pe`, whose evidence set contained unrelated `*.com.pe` companies, and `mercadolibre.co.cr`, whose identity and target-market evidence mixed Costa Rica and Colombia. `uelectronica.com` is not treated as a false positive merely because it also operates in Venezuela: its official contact evidence includes Cúcuta, Colombia. The defect is evidence-to-entity association, not a blanket foreign-domain rule.

## v2.0.7 disposition

The old Product artifact is archived and excluded from final outcome metrics. Its acquisition/model cost remains in the experiment ledger. The Gemini control remains frozen and is reused. A clean Product-only restart is required because corrupted evidence and Mexico-localized acquisition cannot be made equivalent to a cold run by post-hoc filtering.

v2.0.7 validates registrable evidence targets, filters independent evidence by candidate name/domain/entity reference, makes country findings target-market-specific, binds qualification to those findings, sanitizes light-gate output, corrects discovery-yield telemetry and excludes model-failed rounds from confirmed exhaustion. The implementation stage uses no external calls; measured quality and cost are pending the clean restart.

## Clean-restart measurement

The v2.0.7 Product-only restart reused the frozen 15-company Gemini control and rebuilt Product acquisition from an empty Product cache. It published 6/50 Product candidates at cumulative experiment cost USD 5.2302219218. The completion forecast was USD 28.9207 expected and USD 36.6090 upper; no USD 10/20/30 checkpoint was crossed.

The restart did not reproduce the cross-company or cross-country evidence contamination. Its low count is nevertheless not a valid market-scarcity result. Of 47 correction-stage records, 27 ended `Unresolved`; 21 of those were `deterministic-fallback` records after the direct DeepSeek route returned `Insufficient Balance` and the same-model OpenRouter route timed out. Three additional score records remained `retry-required`. The first round paid to supplement 29 correction candidates but produced only 13 model-valid roles and four requested-family roles; the fifth round's seven correction inputs all fell back deterministically. SearchAPI also remained unavailable with its monthly quota response.

The next recovery is acquisition-closed: it may re-run semantic correction for only deterministic fallback records and scoring for only missing, retry-required or materially re-corrected records. It must reuse every valid discovery and evidence artifact, preserve all prior cost, and rebuild the final ranking from the complete cached candidate set. A cross-company same-capability model route is allowed only after bounded failure of the current primary and same-model fallback, with per-route time budgets so one stalled provider cannot consume the whole request deadline.

The v2.0.8 incomplete-only recovery raised Product output from 6 to 13 for USD 0.0339371944 and no acquisition calls. Review then found two deterministic-policy contradictions: one explicit third-party marketplace remained E-tailer, and unknown/weak evidence received maximum scale and buying-influence points. v2.0.9 repaired 66 cached correction/assessment records with zero external calls, removed the marketplace role, capped 15 assessments and retained 12 final candidates. Cumulative experiment cost stayed USD 5.2641908179.
