"""Offline refusal checks; no process creation or native imports."""
import copy
import json
import unittest

import run


class PublicationTests(unittest.TestCase):
    def test_source_drift_or_reallocated_lease_cannot_reuse_saved_evidence(self):
        original = json.loads((run.OUT / 'evidence.json').read_text())
        for change in ('source', 'lease'):
            with self.subTest(change=change):
                evidence = copy.deepcopy(original)
                if change == 'source':
                    evidence['sources'][next(iter(evidence['sources']))] = '0' * 64
                else:
                    evidence['leaseCaps']['worker']['controller'] += 1
                with self.assertRaisesRegex(ValueError, 'source-lease-or-admission-drift'):
                    run.validate_evidence(evidence)

    def test_missing_guardian_report_cannot_be_promoted_to_job_empty(self):
        original = json.loads((run.OUT / 'observations.json').read_text())
        for change in ('job-empty', 'native', 'private', 'integer-verdict'):
            with self.subTest(change=change):
                record = copy.deepcopy(original)
                row = next(row for row in record['cases'] if row['mode'] == 'guardian-loss')
                if change == 'job-empty':
                    row['windowsJobEmpty'] = True
                elif change == 'native':
                    row['nativeExecutionAllowed'] = True
                elif change == 'private':
                    row['path'] = 'synthetic-private-reference'
                else:
                    row['verified'] = 1
                with self.assertRaises(ValueError):
                    run.validate_observations(record)


if __name__ == '__main__':
    unittest.main()
