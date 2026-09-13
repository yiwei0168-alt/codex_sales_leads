"""Independent reconciliation invariants against the unchanged frozen experiment."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("attrition", Path(__file__).with_name("analyze-colombia-attrition.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class FrozenReconciliationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = audit.analyze()
        cls.cells = {c["cellId"]: c for c in cls.result["cells"]}

    def test_39_output_slots_are_38_unique_company_keys(self):
        rows = [r for r in self.result["candidates"] if r["finalOutcome"] == "final-output"]
        self.assertEqual(len(rows), 39)
        self.assertEqual(len({r["companyKey"] for r in rows}), 38)
        invalid = [r for r in rows if r["evaluation"]["requestedCategoryMatch"] is False]
        self.assertEqual(len(invalid), 1)
        self.assertEqual(invalid[0]["cellId"], "CO-si-msp")
        self.assertEqual(invalid[0]["evaluation"]["role"], "VAD")

    def test_occurrences_are_not_company_counts(self):
        retail = self.cells["CO-retail"]
        self.assertEqual(retail["reportedDiscoveryCount"], 238)
        self.assertEqual(retail["uniqueGateKeys"], 163)
        self.assertEqual(retail["reportedRawResults"], retail["storedRawItems"])

    def test_every_identified_company_has_one_outcome(self):
        for cell in self.cells.values():
            self.assertEqual(sum(cell["finalOutcomeCounts"].values()), cell["uniqueIdentifiedKeys"])
        keys = [(r["cellId"], r["companyKey"]) for r in self.result["candidates"]]
        self.assertEqual(len(keys), len(set(keys)))

    def test_recovery_not_fabricated_as_new_discovery(self):
        deltas = [r for r in self.result["rounds"] if r["unattributedRecoveryDelta"]]
        self.assertEqual([(r["cellId"], r["round"], r["unattributedRecoveryDelta"]) for r in deltas],
                         [("CO-retail", 9, 6)])
        recovered = [r for r in self.result["candidates"] if r["finalOutcome"] == "final-output"
                     and r["firstBlockingObservation"]]
        self.assertEqual(len(recovered), 3)

    def test_cost_uses_complete_ledger_including_failed_attempts(self):
        self.assertAlmostEqual(sum(s["budgetCostUsd"] for s in self.result["stageCostsAndVolumes"]),
                               20.537384551625944)
        self.assertGreater(self.result["publishedProductCostUsd"] - self.result["cellSnapshotsCostUsd"], 3)
        self.assertTrue(any(s["cellId"] == "unassigned-product" for s in self.result["stageCostsAndVolumes"]))

    def test_missing_history_is_unknown_not_business_rejection(self):
        counts = self.cells["CO-distribution"]["finalOutcomeCounts"]
        self.assertEqual(counts["unknown-missing-correction"], 1)
        self.assertEqual(self.cells["CO-resale"]["finalOutcomeCounts"]["unknown-missing-correction"], 1)
        self.assertEqual(self.cells["CO-retail"]["finalOutcomeCounts"]["unknown-identity-collision"], 1)
        self.assertFalse(any(r["historyComplete"] for r in self.result["candidates"]))

    def test_empty_hybrid_is_not_supported_multirole(self):
        events = [e for r in self.result["candidates"] if r["cellId"] == "CO-si-msp"
                  for e in r["events"] if e.get("emptyHybrid")]
        self.assertEqual(len(events), 35)
        self.assertEqual({e["model"] for e in events}, {"openai/gpt-4o-mini"})

    def test_analysis_never_claims_new_paid_recovery(self):
        self.assertEqual(self.result["additionalPaidCalls"], 0)
        self.assertFalse(any(r["finalOutcome"] == "qualified-missing-output" for r in self.result["candidates"]))
        self.assertTrue(all(s["userAdoption"] is None for s in self.result["stageCostsAndVolumes"]))


if __name__ == "__main__":
    unittest.main()
