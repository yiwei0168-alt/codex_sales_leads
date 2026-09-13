"""Read-only frozen-run audit. No application imports, network, models, or DB access.

Only explicit stored identity corrections join aliases. Output omits names, domains,
queries, evidence text and contacts; pointers resolve against local frozen inputs.
Run with --check to compare deterministic output without writing anything.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "experiments/search-e2e-evaluation/co-v2"
RUN = "2026-09-08-co-search-e2e-v2"
RAW = BASE / "runs/raw" / RUN
PUBLIC = BASE / "artifacts/runs" / RUN
OUT = ROOT / "docs/reports/COLOMBIA_ATTRITION_REPLAY_2026-09-13.json"
ROLES = {"distribution": {"Distributor", "VAD"}, "resale": {"Reseller", "VAR"},
         "retail": {"Retailer", "E-tailer"}, "si-msp": {"SI", "MSP"}}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def company_key(domain):
    return digest("CO:" + domain.strip().lower())


def analyze():
    sources = {}

    def read(path):
        content = path.read_bytes()
        sources[path.relative_to(ROOT).as_posix()] = hashlib.sha256(content).hexdigest()
        return json.loads(content)

    index = read(RAW / "evaluation/unified-company-index.json")["records"]
    evaluation = {r["domain"]: r for r in index}
    final_report = read(PUBLIC / "final/metrics.json")
    metrics = final_report["metrics"]
    run_events = read(RAW / "run-state.json")["costEvents"]
    cells, rows, rounds, stages, providers = [], [], [], {}, {}
    all_final = collections.defaultdict(list)
    raw_cells = [read(p) for p in sorted((RAW / "cells").glob("*/product-e2e.json"))]
    for data in raw_cells:
        for c in data["finalCandidates"]:
            all_final[company_key(c["domain"])].append(data["cellId"])
    for data in raw_cells:
        cell = data["cellId"]
        category = cell[3:]
        raw = data["raw"]
        # Union only aliases explicitly associated by the saved correction, never
        # infer company ownership from base domains, names or search snippets.
        parents = {}

        def root(domain):
            domain = domain.strip().lower()
            while domain in parents:
                domain = parents[domain]
            return domain

        for c in raw["corrected"]:
            old, new = root(c["correction"]["originalDomain"]), root(c["domain"])
            if old != new:
                parents[old] = new
        candidates = {}

        def row(domain):
            key = root(domain)
            if key not in candidates:
                candidates[key] = {"cellId": cell, "companyKey": company_key(key),
                    "events": [], "rawOccurrences": 0, "providers": [],
                    "firstBlockingObservation": None, "finalOutcome": "unknown",
                    "historyComplete": False}
            return candidates[key]

        unresolved_raw = collections.Counter()
        for ci, call in enumerate(data["discoveryCalls"]):
            p = call["route"]["provider"]
            pk = cell + ":" + p
            stats = providers.setdefault(pk, {"cellId": cell, "provider": p, "calls": 0,
                "rawResults": 0, "reportedNewUnique": 0, "reportedDuplicateHits": 0,
                "failedCalls": 0, "discardedReasons": {}, "companyKeys": set(), "finalKeys": set()})
            for name, value in [("calls", 1), ("rawResults", call["rawResults"]),
                                ("reportedNewUnique", call["newUniqueCompanies"]),
                                ("reportedDuplicateHits", call["existingCompanyHits"]),
                                ("failedCalls", int(call["status"] == "failed"))]:
                stats[name] += value
            for reason, count in call["discardedReasonCounts"].items():
                stats["discardedReasons"][reason] = stats["discardedReasons"].get(reason, 0) + count
            for ii, item in enumerate(call["items"]):
                if not item.get("domain"):
                    unresolved_raw[item.get("rejectionReason") or "unknown"] += 1
                    continue
                r = row(item["domain"])
                r["rawOccurrences"] += 1
                if p not in r["providers"]:
                    r["providers"].append(p)
                stats["companyKeys"].add(r["companyKey"])
                r["events"].append({"stage": "search-normalization", "pointer": f"/discoveryCalls/{ci}/items/{ii}",
                    "outcome": item.get("rejectionReason") or "identified", "provider": p,
                    "firstDiscovery": item["firstDiscovery"]})
        for ri, run in enumerate(raw["discovered"]):
            for bucket in ["candidates", "rejectedCandidates"]:
                for ci, c in enumerate(run[bucket]):
                    r = row(c["domain"])
                    gate = c.get("discoveryGate", {})
                    event = {"stage": "light-gate", "round": ri + 1,
                        "pointer": f"/raw/discovered/{ri}/{bucket}/{ci}",
                        "outcome": gate.get("status", "unknown"),
                        "reasonCodes": gate.get("reasonCodes", []),
                        "retainedForEvidence": bucket == "candidates"}
                    # Freeform model explanations remain in the source, not Git.
                    event.pop("reasonCodes")
                    r["events"].append(event)
                    if bucket == "rejectedCandidates" and r["firstBlockingObservation"] is None:
                        r["firstBlockingObservation"] = {"stage": "light-gate", "round": ri + 1,
                            "reason": "recorded-gate-rejection-not-independently-validated"}
        for ri, run in enumerate(raw["enriched"]):
            for ci, c in enumerate(run["candidates"]):
                row(c["domain"])["events"].append({"stage": "evidence", "round": ri + 1,
                    "pointer": f"/raw/enriched/{ri}/candidates/{ci}",
                    "nonDiscoveryEvidenceCount": sum(e["sourceType"] != "discovery" for e in c["evidence"])})
        corrected_by_root = collections.defaultdict(list)
        for ci, c in enumerate(raw["corrected"]):
            corrected_by_root[root(c["domain"])].append(c)
            correction = c["correction"]
            row(c["domain"])["events"].append({"stage": "persisted-correction", "pointer": f"/raw/corrected/{ci}",
                "primaryRole": correction["primaryRole"], "primaryFamily": correction["primaryFamily"],
                "resolvedRoles": correction["resolvedRoles"],
                "model": correction["model"],
                "emptyHybrid": correction["primaryRole"] == "Hybrid" and not correction["resolvedRoles"],
                "technicalFallback": correction["model"] == "deterministic-fallback"})
        assessments = {a["candidateId"]: (i, a) for i, a in enumerate(raw["assessments"])}
        finals = {root(c["domain"]): c for c in data["finalCandidates"]}
        for domain, r in candidates.items():
            corrections = corrected_by_root.get(domain, [])
            r["identityAmbiguous"] = len(corrections) > 1
            correction = corrections[0]["correction"] if len(corrections) == 1 else None
            pair = assessments.get(corrections[0]["candidateId"]) if len(corrections) == 1 else None
            a = pair[1] if pair else None
            if a:
                r["events"].append({"stage": "persisted-assessment", "pointer": f"/raw/assessments/{pair[0]}",
                    "scoringStatus": a["scoringStatus"], "eligible": a["eligible"],
                    "eligibilityStatus": a["eligibilityStatus"], "totalScore": a["totalScore"], "gates": a["gates"]})
            gate_events = [e for e in r["events"] if e["stage"] == "light-gate"]
            if domain in finals:
                outcome = "final-output"
            elif r["identityAmbiguous"]:
                outcome = "unknown-identity-collision"
            elif a and a["scoringStatus"] != "completed":
                outcome = "incomplete-assessment"
            elif a and (not a["eligible"] or a["eligibilityStatus"] != "eligible"
                        or "not-supported" in a["gates"].values()):
                outcome = "assessment-research-required" if a["eligibilityStatus"] == "research-required" else "assessment-not-eligible"
            elif a and correction and correction["primaryRole"] in ROLES[category]:
                outcome = "qualified-missing-output"
            elif correction and correction["model"] == "deterministic-fallback":
                outcome = "technical-role-fallback"
            elif correction and correction["primaryRole"] in {"Unresolved", "Hybrid"}:
                outcome = "role-" + correction["primaryRole"].lower()
            elif correction and correction["primaryRole"] not in ROLES[category]:
                outcome = "other-primary-role"
            elif correction:
                outcome = "unknown-missing-assessment"
            elif gate_events and not any(e["retainedForEvidence"] for e in gate_events):
                outcome = "gate-rejected"
            elif gate_events:
                outcome = "unknown-missing-correction"
            else:
                outcome = "unknown-pre-gate"
            r["finalOutcome"] = outcome
            if outcome != "final-output" and r["firstBlockingObservation"] is None:
                r["firstBlockingObservation"] = {"stage": "persisted-state-only", "reason": outcome,
                    "chronologicalFirstLossKnown": False}
            r["alsoFinalInCells"] = all_final.get(r["companyKey"], [])
            if correction:
                r["suggestedTargetCategories"] = [cat for cat, roles in ROLES.items() if correction["primaryRole"] in roles]
            if domain in finals:
                record = evaluation.get(finals[domain]["domain"])
                r["evaluation"] = {"found": record is not None,
                    "role": record.get("primaryRole") if record else None,
                    "requestedCategoryMatch": record["primaryRole"] in ROLES[category] if record else None,
                    "realCompany": record.get("isRealOperatingCompany") if record else None,
                    "countryPresence": record.get("operatesInTargetMarket") if record else None}
                for p in r["providers"]:
                    providers[cell + ":" + p]["finalKeys"].add(r["companyKey"])
        cell_rows = list(candidates.values())
        rows.extend(cell_rows)
        previous = 0
        for ri in data["discoveryRounds"]:
            rounds.append({"cellId": cell, **ri,
                "unattributedRecoveryDelta": ri["cumulativeFinalEligible"] - previous - ri["finalEligibleAdded"]})
            previous = ri["cumulativeFinalEligible"]
        cells.append({"cellId": cell, "reportedRawResults": data["rawDiscoveryCount"],
            "storedRawItems": sum(len(c["items"]) for c in data["discoveryCalls"]),
            "rawItemsWithoutDomain": dict(unresolved_raw),
            "reportedDiscoveryCount": data["discoveredCandidateCount"],
            "uniqueIdentifiedKeys": len(cell_rows),
            "uniqueGateKeys": sum(any(e["stage"] == "light-gate" for e in r["events"]) for r in cell_rows),
            "uniqueEvidenceKeys": sum(any(e["stage"] == "evidence" for e in r["events"]) for r in cell_rows),
            "persistedCorrectedCount": len(raw["corrected"]),
            "completedAssessments": sum(a["scoringStatus"] == "completed" for a in raw["assessments"]),
            "finalOutput": len(finals), "missingSlots": data["missingSlots"], "completionReason": data["completionReason"],
            "evaluationValid": next(c["arms"]["product-e2e"]["validCount"] for c in metrics["byCell"] if c["cellId"] == cell),
            "finalOutcomeCounts": dict(sorted(collections.Counter(r["finalOutcome"] for r in cell_rows).items()))})
    # Preserve each event and sum only exact event IDs once. Different stage
    # volumes have different units; never sum them into unique-company counts.
    seen = {}
    for e in run_events:
        if e["ledger"] != "product-e2e-arm":
            continue
        cell = e.get("cellId") or "unassigned-product"
        if e["eventId"] in seen:
            if seen[e["eventId"]] != e:
                raise ValueError("Conflicting duplicate cost event: " + e["eventId"])
            continue
        seen[e["eventId"]] = e
        key = cell + ":" + e["stage"]
        s = stages.setdefault(key, {"cellId": cell, "stage": e["stage"], "events": 0, "budgetCostUsd": 0,
            "unknownCostEvents": 0, "latencyMs": 0, "retries": 0, "usage": {}, "volume": {}, "discardedReasons": {}})
        s["events"] += 1
        s["budgetCostUsd"] += e["budgetCostUsd"] or 0
        s["unknownCostEvents"] += e["budgetCostUsd"] is None
        s["latencyMs"] += e["latencyMs"]
        s["retries"] += e["retries"]
        for bucket in ["usage", "volume"]:
            for k, v in e[bucket].items():
                if isinstance(v, (int, float)):
                    s[bucket][k] = s[bucket].get(k, 0) + v
        for k, v in e["volume"]["discardedReasonCounts"].items():
            s["discardedReasons"][k] = s["discardedReasons"].get(k, 0) + v
    for s in stages.values():
        valid = s["volume"].get("validOutputItems", 0)
        s["utilization"] = s["volume"].get("downstreamUsedItems", 0) / valid if valid else None
        s["userAdoption"] = None
        if s["unknownCostEvents"]:
            s["budgetCostUsd"] = None
    for p in providers.values():
        p["uniqueIdentifiedCompanies"] = len(p.pop("companyKeys"))
        p["finalCompanyKeys"] = sorted(p.pop("finalKeys"))
    cost = sum(s["budgetCostUsd"] for s in stages.values() if s["budgetCostUsd"] is not None)
    published_cost = final_report["cost"]["byLedger"]["product-e2e-arm"]
    if abs(cost - published_cost) > 1e-9:
        raise ValueError("Product cost does not reconcile to the frozen published ledger")
    return {"schemaVersion": 1, "runId": RUN, "sourceSha256": dict(sorted(sources.items())),
        "scope": "offline stored observations; no new search, evidence, model judgment or product change",
        "additionalPaidCalls": 0, "additionalPaidCostUsd": 0,
        "publishedProductCostUsd": published_cost,
        "cellSnapshotsCostUsd": sum(e["budgetCostUsd"] or 0 for c in raw_cells for e in c["costEvents"]),
        "sharedCostPolicy": "Unassigned product preflight remains independent; no inferred per-company allocation. All product costs /39 output slots or /38 evaluation-valid companies are average unit costs, not invoices or allocations.",
        "cells": cells, "rounds": rounds, "candidates": sorted(rows, key=lambda r: (r["cellId"], r["companyKey"])),
        "stageCostsAndVolumes": list(stages.values()), "providerContribution": list(providers.values()),
        "limits": ["Persisted corrections/assessments may overwrite earlier versions; first chronological loss is unknown unless stored.",
            "Company identity joins only explicit correction aliases; cross-company/parent ownership is not inferred.",
            "Known domains absent from gate snapshots are unknown, not business rejections.",
            "Evaluation-valid means positive slot utility, not the >=65 evaluation qualification threshold.",
            "Stage volume is event-attributed, not unique companies or actual user adoption.",
            "Potential role recovery is not qualified recovery or measured fill-rate improvement."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = analyze()
    content = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != content:
            raise SystemExit("Frozen attrition output differs; inspect inputs and regenerate explicitly.")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(content, encoding="utf-8")
    for c in result["cells"]:
        print(c["cellId"], c["uniqueGateKeys"], c["finalOutcomeCounts"])
    print("Frozen sources:", len(result["sourceSha256"]), "Candidate/cell rows:", len(result["candidates"]))
