"""Offline refusal of stale composition, forged Linux witness and native promotion."""
import copy
import json
import unittest

import run


class PublicationTests(unittest.TestCase):
    def test_source_budget_or_clock_changes_require_new_evidence(self):
        original = json.loads((run.OUT / 'evidence.json').read_text())
        for change in ('source', 'budget', 'clock'):
            with self.subTest(change=change):
                evidence = copy.deepcopy(original)
                if change == 'source':
                    evidence['sources'][next(iter(evidence['sources']))] = '0' * 64
                elif change == 'budget':
                    evidence['linuxSlices']['worker'] += 1
                else:
                    evidence['windowsDeadlineSeconds'] += 1
                with self.assertRaisesRegex(ValueError, 'source-budget-clock-or-admission-drift'):
                    run.validate_evidence(evidence)

    def test_missing_job_report_and_linux_failures_cannot_be_promoted(self):
        original = json.loads((run.OUT / 'observations.json').read_text())
        for change in ('job-empty', 'linux', 'native', 'private', 'lease-reason'):
            with self.subTest(change=change):
                record = copy.deepcopy(original)
                row = next(row for row in record['cases'] if row['mode'] == 'guardian-loss')
                if change == 'job-empty':
                    row['windowsJobEmpty'] = True
                elif change == 'linux':
                    row['linuxCgroupEmpty'] = False
                elif change == 'native':
                    row['nativeExecutionAllowed'] = True
                elif change == 'private':
                    row['pid'] = 123
                else:
                    next(row for row in record['cases'] if row['mode'] == 'stall')['leaseReason'] = 'eof'
                with self.assertRaises(ValueError):
                    run.validate_observations(record)


if __name__ == '__main__':
    unittest.main()
