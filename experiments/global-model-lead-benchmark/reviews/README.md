# Codex company-fit audit and blinded human validation

This directory is the local working area for Codex-normalized company candidates,
full-pool Codex assessments, and the single human reviewer's sampled decisions.
Files contain benchmark evidence and are ignored by Git.

Codex prepares one evidence packet per deduplicated company from every system's
top 10 answer positions in each of the four fixed categories. The packet retains exact answer excerpts and cited URLs
but replaces provider, model, product, and run identities with salted blind IDs.
The secret salt remains local.

Codex reviews the full pool using six evidence gates and five potential-fit
dimensions totaling 100 points. Current Cudy relationship is zero-weight metadata:
confirmed existing relationships are separated from the net-new primary pool but
do not receive a score bonus or penalty. Contacts and contact methods are outside
the v4 protocol and receive no search effort, audit, or score.
An inaccurate submitted category does not invalidate an otherwise eligible company;
it lowers the relevant company-fit dimensions and remains attributed to the submitted category.

After Codex finishes, `npm run benchmark:prepare-human-audit` selects a
deterministic, stratified 25 percent sample with a minimum of 12 candidates. It
also adds a separate high-risk supplement capped at 10 percent of the pool. Provider/product identity,
Codex scores, risk flags, and sampling strata remain hidden from the reviewer.
The reviewer checks company identity, submitted-category alignment, evidence gates, and fit only.

`npm run benchmark:evaluate-human-audit` compares the completed decisions with
the frozen Codex assessment. If any configured agreement threshold fails, it
recommends an additional sample equal to 15 percent of the full candidate pool.

Only aggregate, redacted metrics may be committed. Raw answers, candidate names,
blind-ID salts, Codex scores, human decisions, sampling manifests,
and disagreement records remain local.

Run `npm run benchmark:prepare-review` after all measured calls finish. Codex then
records independent public-web evidence in `verification.local.json` and runs
`npm run benchmark:apply-verification`. Codex writes the complete
`codex-assessments.local.json` using `lib/codex-audit.ts`; no tested model receives
post-run evidence. The resulting evidence and human-audit packets remain local and
contain no provider identity.
