"""Regression checks for accidental admission and cross-source coverage transfer."""
import copy
import tempfile
import unittest
from pathlib import Path

import check


class ReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ledger = check.read_json(check.OUT / 'readiness.json')
        cls.facts = [check.cohort_facts(check.ROOT, name)[0] for name in check.COHORTS]

    def test_execution_and_coverage_promotions_are_refused(self):
        promotions = {'decision': 'APPROVE', 'nativeAdmissionGranted': True, 'mayAuthorizeExecution': True,
            'nativeU0Runs': 1, 'sameArtifactRegressionSuite': True, 'nativeFramePressureQualified': True}
        check.validate_ledger(self.ledger, self.facts)
        for key, value in promotions.items():
            with self.subTest(key=key):
                changed = copy.deepcopy(self.ledger)
                changed[key] = value
                with self.assertRaises(ValueError):
                    check.validate_ledger(changed, self.facts)
        for requirement in check.STATES:
            with self.subTest(requirement=requirement):
                changed = copy.deepcopy(self.ledger)
                next(row for row in changed['requirements'] if row['id'] == requirement)['status'] = 'complete'
                with self.assertRaises(ValueError):
                    check.validate_ledger(changed, self.facts)

    def test_cross_source_cases_and_extra_admission_fields_are_refused(self):
        changed = copy.deepcopy(self.ledger)
        changed['cohorts'][2]['cases'].append('foreign')
        with self.assertRaises(ValueError):
            check.validate_ledger(changed, self.facts)
        changed = copy.deepcopy(self.ledger)
        changed['cohorts'][2]['sourceSetSha256'] = changed['cohorts'][0]['sourceSetSha256']
        with self.assertRaises(ValueError):
            check.validate_ledger(changed, self.facts)
        changed = copy.deepcopy(self.ledger)
        changed['requirements'][0]['nativeAdmissionGranted'] = True
        with self.assertRaises(ValueError):
            check.validate_ledger(changed, self.facts)
        changed = copy.deepcopy(self.ledger)
        changed['requirements'][1]['dependsOn'] = []
        with self.assertRaises(ValueError):
            check.validate_ledger(changed, self.facts)

    def test_reference_corruption_and_escape_are_refused(self):
        with tempfile.TemporaryDirectory(prefix='tiye-review-') as directory:
            root = Path(directory)
            path = root / 'record.json'
            path.write_bytes(b'{"mockOnly":true}')
            expected = {'record.json': check.sha(path)}
            check.verify_hashes(root, expected)
            path.write_bytes(b'{"nativeAdmissionGranted":true}')
            with self.assertRaises(ValueError):
                check.verify_hashes(root, expected)
            for name in ('../record.json', '.git/config', 'C:/record.json', 'missing.json'):
                with self.subTest(name=name), self.assertRaises(ValueError):
                    check.checked_path(root, name)


if __name__ == '__main__':
    unittest.main(verbosity=2)
