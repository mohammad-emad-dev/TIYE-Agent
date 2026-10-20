"""Synthetic startup evidence cannot be promoted to native qualification."""
import copy
import json
import unittest

import check


class PublicationTests(unittest.TestCase):
    def test_source_artifact_and_reference_drift_are_refused(self):
        evidence = json.loads((check.OUT / 'evidence.json').read_text())
        check.validate_evidence(evidence)
        for section in ('sources', 'artifacts', 'references'):
            with self.subTest(section=section):
                altered = copy.deepcopy(evidence)
                altered[section][next(iter(altered[section]))] = '0' * 64
                with self.assertRaises(ValueError):
                    check.validate_evidence(altered)

    def test_native_path_configuration_and_private_field_promotions_are_refused(self):
        observed = json.loads((check.OUT / 'observations.json').read_text())
        check.validate(observed)
        for field in ('candidateExecuted', 'nativeHelpersObserved', 'effectivePathQualified',
                      'effectiveConfigurationResolved', 'automaticRetryAllowed', 'nativeExecutionAllowed'):
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    check.validate(dict(observed, **{field: True}))
        with self.assertRaises(ValueError):
            check.validate(dict(observed, privateRoot='/private'))
        with self.assertRaises(ValueError):
            check.validate(dict(observed, tests=True))
