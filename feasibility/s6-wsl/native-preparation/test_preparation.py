import copy
import json
import tempfile
import unittest
from pathlib import Path
import run


class PreparationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package = run.load(run.file_bytes(run.ROOT, run.PACKAGE))

    def test_saved_package_reconciles(self):
        run.verify(self.package)

    def test_admission_and_eligibility_promotions_refused(self):
        for field in ("nativeExecutionAllowed", "nativeAdmissionGranted", "phase1"):
            bad = copy.deepcopy(self.package)
            bad[field] = True
            with self.assertRaises(ValueError):
                run.verify(bad)
        bad = copy.deepcopy(self.package)
        bad["route"]["integrationEligible"] = True
        with self.assertRaises(ValueError):
            run.verify(bad)

    def test_cross_cohort_credit_refused(self):
        bad = copy.deepcopy(self.package)
        bad["cohorts"]["ambient"] = bad["cohorts"]["lifecycle"]
        with self.assertRaises(ValueError):
            run.verify(bad)

    def test_candidate_and_binding_changes_refused(self):
        for field in ("candidate", "bindings"):
            bad = copy.deepcopy(self.package)
            key = next(iter(bad[field]))
            bad[field][key] = "changed"
            with self.assertRaises(ValueError):
                run.verify(bad)

    def test_changed_actual_source_and_saved_installation_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in self.package["bindings"]:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(run.file_bytes(run.ROOT, name))
            source = root / "feasibility/s6-wsl/consolidated-launcher/worker.py"
            original = source.read_bytes()
            source.write_bytes(original + b"\n# synthetic mutation\n")
            with self.assertRaisesRegex(ValueError, "cohort source changed"):
                run.verify(self.package, root)
            source.write_bytes(original)
            installed = root / (run.SAVED + "installation.json")
            evidence = json.loads(installed.read_bytes())
            evidence["linux"]["binarySha256"] = "0" * 64
            installed.write_text(json.dumps(evidence), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "saved candidate/installation mismatch"):
                run.verify(self.package, root)

    def test_unknown_fields_and_duplicate_json_refused(self):
        bad = copy.deepcopy(self.package)
        bad["privateRawPath"] = "synthetic-private-location"
        with self.assertRaises(ValueError):
            run.verify(bad)
        with self.assertRaises(ValueError):
            run.load(b'{"nativeExecutionAllowed":false,"nativeExecutionAllowed":true}')

    def test_noncanonical_artifact_paths_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "owned").write_bytes(b"synthetic")
            self.assertEqual(run.file_bytes(root, "owned"), b"synthetic")
            for name in ("../owned", "/owned", "C:/owned", "a/../owned", "./owned", "a\\owned"):
                with self.assertRaises(ValueError):
                    run.file_bytes(root, name)

    def test_native_flag_refused_before_package_read(self):
        with self.assertRaises(SystemExit) as result:
            run.main(["--native"])
        self.assertEqual(result.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
