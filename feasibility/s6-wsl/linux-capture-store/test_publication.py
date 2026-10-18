import copy
import unittest

import run


class PublicationTests(unittest.TestCase):
    def fixture(self):
        return {"successful": True, "tests": 9, "scope": "synthetic-linux-store-only",
                "codeBundleRemoved": True, "retained": True, "bundleHashes": {"owned": "fixture"},
                "log": "\n".join(name + " (fixture.Case) ... ok" for name in run.CASES),
                "root": "synthetic-private-location", "raw": [{"uid": 9999}]}

    def test_public_derivative_drops_private_metadata(self):
        public = run.select_public(self.fixture(), {"owned": "fixture"})
        run.validate_public(public)
        self.assertNotIn("root", public)
        self.assertNotIn("raw", public)

    def test_failed_missing_or_different_bundle_not_published(self):
        for field, replacement in (("successful", False), ("tests", 8), ("log", ""),
                                   ("bundleHashes", {}), ("codeBundleRemoved", False)):
            raw = self.fixture()
            raw[field] = replacement
            with self.assertRaises(ValueError):
                run.select_public(raw, {"owned": "fixture"})

    def test_scope_promotion_and_field_injection_refused(self):
        public = run.select_public(self.fixture(), {"owned": "fixture"})
        for field, replacement in (("scope", "native-qualified"), ("privatePath", "synthetic")):
            changed = copy.deepcopy(public)
            changed[field] = replacement
            with self.assertRaises(ValueError):
                run.validate_public(changed)
        public["limits"]["P2"] = "CLOSED"
        with self.assertRaises(ValueError):
            run.validate_public(public)


if __name__ == "__main__":
    unittest.main()
