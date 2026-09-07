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
