# v1.4 independent candidate-value correction

## Confirmed decision

The main benchmark measures the value of the candidate information delivered to a sales user. Provider citation production is not a proxy for candidate truth. `provider_evidence_completeness` is therefore a separate structural diagnostic with zero main-score weight.

No new human blind audit is added in v1.4. The human-confirmed role, multi-role, submitted-lane, product-fit and cooperation-path judgments from v1.3 remain unchanged. This revision changes the evidence-source boundary and corrects the Gemini Full cases that the extraction pipeline could not semantically resolve.

## Evaluation layers

1. Provider output proposes candidates. Its URLs and text are retained for traceability.
2. Candidate truth is decided independently at canonical-company plus submitted-lane level.
3. Independent decisions use `verified-pass`, `verified-fail`, or `unresolved`.
4. Retrieval failure is not a negative fact. Only `verified-fail` can force a specially reviewed candidate to zero; unresolved cases block finalization.
5. A decision is shared with every system occurrence of the same canonical company in the same lane.

The existing v1.3.1 shared-evidence scores remain the baseline for candidates without a special independent decision. The old `sufficientEvidence` field is no longer a main value gate: when the five substantive value gates pass, a candidate may score with a correspondingly low information-confidence level. This rule is system-neutral.

## Main score

The five value gates are company existence, Germany presence, active-networking relevance, submitted-lane membership and canonical uniqueness.

Eligible candidates receive:

`product/use-case fit × 9 + cooperation path × 7 + independent information confidence × 4`

Candidate and path fit supply 80% of the available points. Independent information confidence supplies 20%. Provider evidence completeness supplies 0%.

## Gemini Full adjudication

All 30 Gemini Full candidates were reviewed independently against current official material. The result is 24 `verified-pass`, 6 `verified-fail`, and 0 unresolved:

- tier-1 distribution: 10 pass, 0 fail;
- B2B resale: 8 pass, 2 fail;
- project services: 6 pass, 4 fail.

The six verified failures are SoftwareOne and Skaylink in B2B resale, plus BFE, EQOS Energie, KUMAVISION and GISA in project services. Each is a real company; the zero follows from missing or contradicted Cudy-relevant active-networking/lane fit after review, not from a provider citation omission.

The 30 canonical-company/lane decisions update 43 system occurrences because 13 matching occurrences were also submitted by other systems. That reuse is intentional and prevents a Gemini-only scoring exception.

## Separate provider diagnostic

`provider_evidence_completeness` is the percentage of submitted canonical occurrences with at least one non-empty provider URL and excerpt. It does not test whether the text is correct, whether the URL proves the claim, or whether a candidate is valuable. Its only intended use is product-output diagnostics.

## Reproduction

```text
npm run benchmark:v1.4:score -- --run-id=2026-08-27-de-v1.3
npm run benchmark:v1.4:verify -- --run-id=2026-08-27-de-v1.3
```
