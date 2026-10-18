"""Offline regressions for selected evidence and uncertainty/publication boundaries."""
import copy
import json
import unittest

import run
from publication import validate_records


class PublicTests(unittest.TestCase):
    def setUp(self):
        self.records = json.loads((run.OUT / 'observations.json').read_text(encoding='utf-8'))
        self.digest = run.fingerprint(run.source_manifest())

    def test_saved_capture_verifies(self):
        self.assertEqual(run.check(), 0)

    def test_raw_or_private_path_fields_cannot_bypass_selector(self):
        for key in ('rawBase64', 'windowsRoot', 'privateEvidence'):
            with self.subTest(key=key):
                changed = copy.deepcopy(self.records)
                changed[0][key] = 'synthetic-private-canary'
                with self.assertRaisesRegex(ValueError, 'public-verdict-or-unreviewed-field'):
                    validate_records(changed, self.digest)

    def test_dead_owner_cannot_acquire_completion_or_deletion(self):
        for mode in run.contract.OWNERS:
            for key, replacement in (('ownerReport', 'retained'), ('protocolOutcome', 'handshake-and-clean-eof'),
                                      ('retention', {'required': False, 'deleted': True, 'deletionAllowed': True})):
                with self.subTest(mode=mode, key=key):
                    changed = copy.deepcopy(self.records)
                    owner = next(record for record in changed if record['case'] == mode)
                    owner[key] = replacement
                    with self.assertRaisesRegex(ValueError, 'public-verdict-or-unreviewed-field'):
                        validate_records(changed, self.digest)

    def test_pressure_delivery_and_dead_owner_control_cannot_be_promoted(self):
        mutations = (('pressure-stop', 'delivery', 'confirmed'),
                     ('pressure-transport-loss', 'pendingDrainObserved', False),
                     ('pressure-owner-loss', 'stdinAbortRequested', True),
                     ('pressure-owner-loss', 'outcome', 'locally-drained'),
                     ('pressure-stop', 'nativeFrameCapacityQualified', True))
        for mode, key, replacement in mutations:
            with self.subTest(mode=mode, key=key):
                changed = copy.deepcopy(self.records)
                witness = next(record for record in changed if record['case'] == mode)['pressure']
                witness[key] = replacement
                with self.assertRaisesRegex(ValueError, 'pressure-uncertainty-or-pending-evidence-mismatch'):
                    validate_records(changed, self.digest)

    def test_missing_case_or_oversize_verdict_refuses_publication(self):
        with self.assertRaisesRegex(ValueError, 'public-case-coverage'):
            validate_records(self.records[:-1], self.digest)
        changed = copy.deepcopy(self.records)
        changed[0]['privateBytes'] = run.contract.PER_CASE + 1
        with self.assertRaisesRegex(ValueError, 'public-verdict-or-unreviewed-field'):
            validate_records(changed, self.digest)

    def test_mock_assessment_cannot_close_privacy_or_admit_native(self):
        for target, replacement in (('P1', 'CLOSED'), ('P2', 'CLOSED'), ('A1', 'ADMITTED')):
            with self.subTest(target=target):
                assessment = run.admission_assessment(self.digest)
                assessment['states'][target] = replacement
                with self.assertRaisesRegex(ValueError, 'mock-matrix-cannot-promote-admission'):
                    run.validate_assessment(assessment, self.digest)
        assessment = run.admission_assessment(self.digest)
        assessment['nativeAdmissionGranted'] = True
        with self.assertRaisesRegex(ValueError, 'mock-matrix-cannot-promote-admission'):
            run.validate_assessment(assessment, self.digest)


if __name__ == '__main__':
    unittest.main()
