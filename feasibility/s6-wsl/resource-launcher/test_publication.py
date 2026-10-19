"""Offline refusal tests; importing the checker never imports Windows I/O helpers."""
import copy
import json
import unittest

import run


class PublicationTests(unittest.TestCase):
    def test_source_drift_cannot_reuse_saved_evidence(self):
        evidence = json.loads((run.OUT / 'evidence.json').read_text())
        observations = json.loads((run.OUT / 'observations.json').read_text())
        evidence['sources'][next(iter(evidence['sources']))] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'source-or-native-admission-drift'):
            run.validate(evidence, observations)

    def test_native_promotion_private_fields_and_forged_verdict_are_refused(self):
        original = json.loads((run.OUT / 'observations.json').read_text())
        for change in ('native', 'private', 'verified', 'count'):
            with self.subTest(change=change):
                record = copy.deepcopy(original)
                if change == 'native':
                    record['nativeExecutionAllowed'] = True
                elif change == 'private':
                    record['cases'][0]['path'] = 'synthetic-private-locator'
                elif change == 'verified':
                    record['cases'][0]['verified'] = 1
                else:
                    record['unitTests'] = True
                with self.assertRaises(ValueError):
                    run.validate_observations(record)


if __name__ == '__main__':
    unittest.main()
