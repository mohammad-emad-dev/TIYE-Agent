import copy
import unittest

import run


class PublicationTests(unittest.TestCase):
    def fixture(self):
        witness = {"user": "synthetic-owner", "restricted": True, "restrictingSids": ["S-1-5-12"],
                   "enabledPrivileges": ["SeChangeNotifyPrivilege"], "type": 2,
                   "impersonationLevel": 2, "tokenId": [17, 0]}
        return {"scope": "same-account-restricted-token-only", "ownerBeforeAfter": True,
                "reverted": True, "controlPathsOpened": True, "payloadUnchanged": True,
                "owner": "synthetic-owner", "targets": [{"path": "synthetic-private-path"}],
                "rows": [{"target": target, "right": label, "requested": rights,
                          "token": copy.deepcopy(witness), "protected": {"opened": False, "error": 5},
                          "control": {"opened": True, "error": 0}}
                         for target in ("root", "run", "payload", "retention", "leaf")
                         for label, rights in run.RIGHTS.items()]}

    def test_public_derivative_omits_identifiers_and_locations(self):
        selected = run.select_public(self.fixture())
        run.validate_public(selected)
        self.assertNotIn("owner", selected)
        self.assertNotIn("targets", selected)
        self.assertNotIn("rows", selected)

    def test_invalid_token_or_changed_identity_refused(self):
        mutations = (("user", "different-owner"), ("restrictingSids", []),
                     ("enabledPrivileges", ["SeChangeNotifyPrivilege", "SeBackupPrivilege"]),
                     ("type", 1), ("impersonationLevel", 1), ("tokenId", [18, 0]))
        for field, replacement in mutations:
            report = self.fixture()
            report["rows"][0]["token"][field] = replacement
            with self.assertRaises(ValueError):
                run.select_public(report)

    def test_wrong_error_missing_control_or_incomplete_pairs_refused(self):
        for field, replacement in (("protected", {"opened": False, "error": 32}),
                                   ("control", {"opened": False, "error": 5}), ("requested", 0)):
            report = self.fixture()
            report["rows"][0][field] = replacement
            with self.assertRaises(ValueError):
                run.select_public(report)
        report = self.fixture()
        report["rows"].pop()
        with self.assertRaises(ValueError):
            run.select_public(report)
        for flag in ("ownerBeforeAfter", "reverted", "controlPathsOpened", "payloadUnchanged"):
            report = self.fixture()
            report[flag] = False
            with self.assertRaises(ValueError):
                run.select_public(report)

    def test_private_field_and_admission_promotion_refused(self):
        for field, replacement in (("scope", "other-account-isolation"), ("rawPath", "synthetic")):
            selected = run.selected_shape()
            selected[field] = replacement
            with self.assertRaises(ValueError):
                run.validate_public(selected)
        selected = run.selected_shape()
        selected["limits"]["nativeAdmissionGranted"] = True
        with self.assertRaises(ValueError):
            run.validate_public(selected)


if __name__ == "__main__":
    unittest.main()
