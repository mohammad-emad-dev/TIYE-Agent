import copy
import unittest

from results import CASES, select_public, selected, validate_records

DIGEST = "f" * 64


class ResultTests(unittest.TestCase):
    def record(self, case):
        return {"sourceSetSha256": DIGEST, "case": "owner-loss" if case == "owner-loss-refused" else "valid"}

    def measured(self, case):
        if case.endswith("refused"):
            return {"review": {"decision": "retained-refused", "reviewAbsent": True, "intentAbsent": True},
                    "retainedUnchanged": True, "privatePath": "synthetic"}
        return {"review": {"decision": "reviewed"}, "callerReviewPersisted": True,
                "postReviewGuardsPassed": True, "first": {"decision": "interrupted"},
                "final": {"decision": "quarantined-final-metadata" if case == "metadata-quarantine" else "removed",
                          "noDeletionAttempted": True, "rootAbsent": case != "metadata-quarantine"},
                "terminalIntentOnly": True, "privatePath": "synthetic"}

    def test_each_scope_selects_only_public_fields(self):
        for case in CASES:
            public = select_public(case, self.record(case), self.measured(case), DIGEST)
            self.assertEqual(public, selected(case, DIGEST))
            self.assertNotIn("privatePath", public)

    def test_missing_review_persistence_removal_or_refusal_witness_fails(self):
        variants = (("complete", "callerReviewPersisted", False), ("complete", "postReviewGuardsPassed", False),
                    ("metadata-quarantine", "terminalIntentOnly", False), ("owner-loss-refused", "retainedUnchanged", False))
        for case, field, replacement in variants:
            measured = self.measured(case)
            measured[field] = replacement
            with self.assertRaises(ValueError):
                select_public(case, self.record(case), measured, DIGEST)
        measured = self.measured("complete")
        measured["final"]["rootAbsent"] = False
        with self.assertRaises(ValueError):
            select_public("complete", self.record("complete"), measured, DIGEST)
        mismatched = self.record("complete")
        mismatched["case"] = "owner-loss"
        with self.assertRaises(ValueError):
            select_public("complete", mismatched, self.measured("complete"), DIGEST)

    def test_case_loss_private_field_or_admission_promotion_refused(self):
        records = [selected(case, DIGEST) for case in CASES]
        validate_records(records, DIGEST)
        for mutation in ("private", "admission", "case"):
            changed = copy.deepcopy(records)
            if mutation == "private":
                changed[0]["rawReview"] = {"synthetic": True}
            elif mutation == "admission":
                changed[0]["limits"]["nativeAdmissionGranted"] = True
            else:
                changed.pop()
            with self.assertRaises(ValueError):
                validate_records(changed, DIGEST)


if __name__ == "__main__":
    unittest.main()
