"""Offline refusal of changed sources, timing and promoted cleanup verdicts."""
import copy
import json
import unittest

import check


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.evidence = json.loads((check.OUT / 'evidence.json').read_text())
        self.observations = json.loads((check.OUT / 'observations.json').read_text())

    def test_source_artifact_and_reference_drift_are_refused(self):
        check.validate_evidence(self.evidence)
        for section in ('sources', 'artifacts', 'references'):
            with self.subTest(section=section):
                changed = copy.deepcopy(self.evidence)
                changed[section][next(iter(changed[section]))] = '0' * 64
                with self.assertRaises(ValueError):
                    check.validate_evidence(changed)

    def test_unknown_timing_and_private_field_promotions_are_refused(self):
        check.validate_observations(self.observations)
        guardian = next(row for row in self.observations['cases'] if row['mode'] == 'guardian-loss')
        owner = next(row for row in self.observations['cases'] if row['mode'] == 'owner-exit')
        variants = [dict(guardian, cleanupVerified=True), dict(guardian, outcome='cleanup-observed'),
                    dict(owner, nativeExecutionAllowed=True), dict(owner, automaticRetryAllowed=True),
                    dict(owner, privatePid=42), dict(owner, cleanupCutoffSeconds=0)]
        for endpoint in (float('nan'), 91, True):
            changed = copy.deepcopy(owner)
            changed['phases'][-1]['endSeconds'] = endpoint
            variants.append(changed)
        for changed in variants:
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError):
                    check.validate_case(changed)
