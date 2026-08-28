# Experiment reports

- `v1.5-hybrid-search-strategy-and-low-score-audit.md` derives a role-specific adaptive provider policy from v1.5, specifies the proposed SearchAPI Bing fallback, and audits every selected candidate below 50. It identifies a retrospective rescoring defect that must be fixed before the leaderboard is treated as final.
- `v1.5-end-to-end-correction-final-report.md` is the current frozen end-to-end correction report and full candidate disclosure. Its ranking is now provisional in light of the low-score audit above.
- `v1.4-independent-value-final-report.md` is the previous candidate-value report. It independently adjudicates Gemini Full, makes provider evidence completeness a zero-weight diagnostic, and reuses the confirmed v1.3 human calibration without a new blind audit.
- `v1.3-google-places-local-final-report.md` is the historical provider-neutral extraction-pipeline report and lower-bound ranking.

Only evidence-linked reports belong here. `final-report.md` preserves the original v1.2 measurement narrative; later versioned reports supersede its conclusion without rewriting the historical artifacts.
