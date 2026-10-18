import copy
import unittest

from publication import public_record, select_public, validate_records

FINGERPRINT = "f" * 64


class PublicationTests(unittest.TestCase):
    def finalized(self, case):
        public = public_record(case, FINGERPRINT)
        return {**public, "runtimeFileCount": 25, "archiveBytes": 1000, "witnessBytes": 2000,
                "privatePath": "synthetic-only"}

    def record(self, case):
        return {"case": "owner-loss" if case == "owner-loss" else "valid", "sourceSetSha256": FINGERPRINT}

    def test_each_decision_drops_private_details(self):
        for case in ("valid", "owner-loss", "unexpected-runtime"):
            selected = select_public(self.record(case), self.finalized(case), case, FINGERPRINT)
            self.assertNotIn("privatePath", selected)
            self.assertNotIn("archiveBytes", selected)

    def test_uncertain_or_quarantined_cannot_be_sealed(self):
        for case in ("owner-loss", "unexpected-runtime"):
            finalized = self.finalized(case)
            finalized["decision"] = "sealed"
            finalized["completionAbsent"] = False
            with self.assertRaises(ValueError):
                select_public(self.record(case), finalized, case, FINGERPRINT)

    def test_wrong_identity_missing_witness_or_budget_refused(self):
        for field, replacement in (("identityBound", False), ("observerBound", False),
                                   ("archiveReadback", False), ("archiveBytes", 65537)):
            finalized = self.finalized("valid")
            finalized[field] = replacement
            with self.assertRaises(ValueError):
                select_public(self.record("valid"), finalized, "valid", FINGERPRINT)
        record = self.record("valid")
        record["sourceSetSha256"] = "0" * 64
        with self.assertRaises(ValueError):
            select_public(record, self.finalized("valid"), "valid", FINGERPRINT)

    def test_public_field_injection_missing_case_and_admission_refused(self):
        records = [{**public_record(case, FINGERPRINT), "repeatFinalizationRefused": True}
                   for case in ("valid", "owner-loss", "unexpected-runtime")]
        validate_records(records, FINGERPRINT)
        for mutation in ("extra", "promotion", "retry"):
            changed = copy.deepcopy(records)
            if mutation == "extra":
                changed[0]["rawPath"] = "synthetic"
            elif mutation == "retry":
                changed[0]["repeatFinalizationRefused"] = False
            else:
                changed[0]["limits"]["nativeAdmissionGranted"] = True
            with self.assertRaises(ValueError):
                validate_records(changed, FINGERPRINT)
        with self.assertRaises(ValueError):
            validate_records(records[:-1], FINGERPRINT)


if __name__ == "__main__":
    unittest.main()
