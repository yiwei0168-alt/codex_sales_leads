# Germany v1.7 → v2 fresh-evidence reassessment

Run: 2026-08-30-de-v2-fresh
Generated: 2026-08-30T04:28:06.267Z

## Evidence freshness audit

- Old v1.7 evidence used for scoring: 0
- Current-run scoring evidence: 291
- Prior-run/discovery seeds excluded: 18
- Invalid current evidence rejected: 0

## Comparison

| Company | v1.7 | v2 | Δ | Primary role | Scale | Research | Account tier | Eligibility |
|---|---:|---:|---:|---|---|---|---|---|
| Herweck AG | 52 | 84 | 32 | Distributor | Unknown | deep | Strategic Distributor | eligible |
| TD SYNNEX Germany GmbH & Co. OHG | 56 | 81 | 25 | Distributor | Global/Enterprise | deep | Strategic Distributor | eligible |
| ALSO Deutschland GmbH | 52 | 74 | 22 | Distributor | Unknown | deep | Standard Distributor | research-required |
| telent GmbH | 92 | 73 | -19 | SI | Unknown | deep | Standard | eligible |
| NLS Netzwerke GmbH | 83.2 | 65 | -18.2 | Hybrid | Unknown | deep | Standard | eligible |
| ESA GmbH German Protect | 80.8 | 61 | -19.8 | Hybrid | Local/Small | deep | Standard | research-required |
| Hopf Vertriebsgesellschaft mbH | 76.8 | 60 | -16.8 | Unresolved | Unknown | deep | Standard | research-required |
| m2m Germany GmbH | 76.8 | 47 | -29.8 | Hybrid | Unknown | deep | Standard Distributor | eligible |
| ECOM Electronic Components Trading GmbH | 75.2 | 46 | -29.2 | Distributor | National | deep | Standard Distributor | research-required |
| FUERTE Systems Digital Network Center IT-Systemhaus - Medientechnik | 83.2 | 45 | -38.2 | Hybrid | Unknown | deep | Standard | research-required |
| RHEIN IT | 72 | 41 | -31 | Unresolved | Unknown | deep | Standard | research-required |
| MD Networxs | 72 | 39 | -33 | Unresolved | Unknown | deep | Standard | research-required |
| DNS:NET Internet Service GmbH | 80.8 | 38 | -42.8 | ISP | Regional | deep | Standard | eligible |
| Code Maschine GmbH | 83.2 | 33 | -50.2 | Unresolved | Unknown | deep | Standard | research-required |
| SPIE Germany Switzerland Austria | 83.2 | 27 | -56.2 | Hybrid | Unknown | deep | Standard | research-required |
| Netzwerk-Arzt | 78.4 | 1 | -77.4 | Unresolved | Unknown | deep | Standard | research-required |
| Ghadban Elektrotechnik | 72 | 0 | -72 | Unresolved | Unknown | deep | Standard | research-required |
| IT-Delfin | 92 | 0 | -92 | Unresolved | Unknown | deep | Standard | research-required |

## Cost analysis

- Initial Tavily credits: 0
- Correction-stage Tavily credits: 24
- Monetary estimate status: not-calculated-without-deployed-gateway-rate-card
- Estimated total USD: not available without the deployed gateway rate card

| Task | Model | Requests | Success | Failed | Input tokens | Output tokens | Reasoning tokens | Total tokens | Avg latency ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| lead-evidence-correction | deepseek-v4-pro | 14 | 14 | 0 | 317301 | 41800 | 0 | 359101 | 43366 |
| lead-qualification | deepseek-v4-pro | 27 | 26 | 1 | 624848 | 104106 | 0 | 728954 | 68349 |
| lead-qualification | deepseek-v4-pro | 27 | 27 | 0 | 681344 | 110671 | 0 | 792015 | 66572 |
| lead-qualification | deepseek-v4-pro | 2 | 2 | 0 | 19262 | 7311 | 0 | 26573 | 61061 |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 14850 | 1101 | 0 | 15951 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 11252 | 1804 | 0 | 13056 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 13777 | 2765 | 516 | 16542 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 25459 | 2811 | 252 | 28270 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 11964 | 3051 | 900 | 15015 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 16966 | 3030 | 437 | 19996 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 24270 | 3186 | 306 | 27456 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 16321 | 1762 | 516 | 18083 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 12776 | 3699 | 1701 | 16475 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 29581 | 3623 | 1034 | 33204 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 16126 | 4110 | 2051 | 20236 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 10656 | 3190 | 438 | 13846 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 24464 | 2266 | 436 | 26730 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 18354 | 2798 | 388 | 21152 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 22994 | 3214 | 516 | 26208 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 14604 | 3565 | 379 | 18169 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 15842 | 4214 | 1776 | 20056 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 17753 | 1127 | 0 | 18880 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 28524 | 3157 | 1204 | 31681 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 16817 | 4137 | 1664 | 20954 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 21138 | 4248 | 1627 | 25386 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 29905 | 4760 | 1999 | 34665 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 27574 | 5045 | 2198 | 32619 | — |
| lead-review-judge | gpt-5.6-sol | 1 | 1 | 0 | 18486 | 2677 | 1552 | 21163 | — |
| lead-review-secondary | gpt-5.6-sol | 1 | 1 | 0 | 11671 | 3535 | 452 | 15206 | — |

### Main cost drivers

- raw evidence characters and duplicated page content
- model retries after timeout or schema failure
- per-candidate escalation for ambiguity, conflicts and multi-path decisions
- blind secondary review and disagreement judging

### Cost controls

- Reuse immutable current-run evidence and corrected-candidate checkpoints instead of reacquiring or recorrecting unchanged companies.
- Select claim-linked evidence per role and scoring dimension before model calls; do not send unrelated raw pages.
- Use token-aware batches with a hard prompt budget instead of a fixed company count.
- Keep routine-model scoring and trigger high-capability review only for confirmed ambiguity, conflict, multi-path, boundary or audit cases.
- Retry only omitted or invalid candidates, never an otherwise valid whole batch.
- Use prompt caching for the stable Cudy rubric, JSON schema and confirmed knowledge baseline where the deployed gateway supports it.
