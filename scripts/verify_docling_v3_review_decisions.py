"""Verify that user-confirmed review decisions stay exact and non-inheritable."""

from __future__ import annotations

import json
from pathlib import Path

from run_docling_v3_full import apply_decisions, load_decisions


decision_path = Path("config/knowledge/docling-review-decisions.v3.json")
decisions, confirmed_at = load_decisions(decision_path)
candidate = {key for key, value in decisions.items() if value == "accept-candidate"}
decorative = {key for key, value in decisions.items() if value == "decorative-no-body"}
if len(candidate) != 26 or len(decorative) != 3 or candidate & decorative:
    raise SystemExit("Review decision cardinality changed")

candidate_key = next(iter(candidate))
artifact = {
    "sourceSha256": candidate_key[0],
    "units": [{"unitIndex": candidate_key[1], "status": "review-required", "contentSha256": "a" * 64, "textLength": 10}],
}
apply_decisions(artifact, decisions, confirmed_at)
unit = artifact["units"][0]
if unit["status"] != "review-required" or unit["humanReviewDecision"] != "accept-candidate":
    raise SystemExit("Candidate evidence was promoted or lost its review decision")

decorative_key = next(iter(decorative))
artifact = {
    "sourceSha256": decorative_key[0],
    "units": [{"unitIndex": decorative_key[1], "status": "review-required", "contentSha256": None, "textLength": 0}],
}
apply_decisions(artifact, decisions, confirmed_at)
unit = artifact["units"][0]
if unit["status"] != "blank" or unit["humanReviewDecision"] != "decorative-no-body":
    raise SystemExit("Decorative decision was not applied")

unknown = {"sourceSha256": "f" * 64, "units": [{"unitIndex": 1, "status": "review-required"}]}
apply_decisions(unknown, decisions, confirmed_at)
if "humanReviewDecision" in unknown["units"][0]:
    raise SystemExit("An unlisted unit inherited a review decision")

recommendations = json.loads(Path("config/knowledge/docling-review-recommendations.v3.json").read_text(encoding="utf-8"))
recommended_candidate = {
    (source["sourceSha256"], int(unit))
    for source in recommendations["sources"] for unit in source["candidateUnits"]
}
recommended_decorative = {
    (source["sourceSha256"], int(unit))
    for source in recommendations["sources"] for unit in source["decorativeUnits"]
}
if recommendations["status"] != "recommendation-only-not-human-confirmed":
    raise SystemExit("Full review recommendations were mislabeled as confirmed")
if len(recommended_candidate) != 33 or len(recommended_decorative) != 13:
    raise SystemExit("Full review recommendation cardinality changed")
if recommended_candidate & recommended_decorative or (recommended_candidate | recommended_decorative) & (candidate | decorative):
    raise SystemExit("Review recommendation coordinates overlap or inherited a pilot decision")

print(json.dumps({
    "candidateReviewRequired": len(candidate), "decorativeNoBody": len(decorative), "unknownInherited": 0,
    "unconfirmedCandidateRecommendations": len(recommended_candidate),
    "unconfirmedDecorativeRecommendations": len(recommended_decorative),
}))
