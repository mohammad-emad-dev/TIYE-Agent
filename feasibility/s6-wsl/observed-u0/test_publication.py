"""Scope and source refusal at the new integration publication boundary."""
import copy
import json
import unittest

import check


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.evidence = json.loads((check.OUT / 'evidence.json').read_text())
        self.observations = json.loads((check.OUT / 'observations.json').read_text())

    def test_source_artifact_reference_and_generated_drift_are_refused(self):
        check.validate_evidence(self.evidence)
        for section in ('sources', 'artifacts', 'references'):
            with self.subTest(section=section):
                changed = copy.deepcopy(self.evidence)
                changed[section][next(iter(changed[section]))] = '0' * 64
                with self.assertRaises(ValueError):
                    check.validate_evidence(changed)

    def test_startup_receipt_native_and_unknown_promotions_are_refused(self):
        check.validate_observations(self.observations)
        variants = []
        for field, value in [('startupObserverVerified', False), ('initializeResponseVerified', False),
                             ('initializedPeerReceiptEstablished', True), ('candidateExecuted', True),
                             ('nativeAdmissionGranted', True), ('nativeExecutionAllowed', True),
                             ('privateRoot', '/private')]:
            altered = copy.deepcopy(self.observations)
            altered['cases'][0][field] = value
            variants.append(altered)
        altered = copy.deepcopy(self.observations)
        row = next(row for row in altered['cases'] if row['mode'] == 'guardian-loss')
        row['outcome'], row['cleanupVerified'] = 'cleanup-observed', True
        variants.append(altered)
        for altered in variants:
            with self.subTest(altered=altered):
                with self.assertRaises(ValueError):
                    check.validate_observations(altered)
