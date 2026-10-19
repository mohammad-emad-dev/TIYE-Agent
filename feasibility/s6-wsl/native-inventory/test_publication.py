"""Publication cannot turn passive inspection into startup or admission credit."""
import copy
import json
import unittest

import check
from inspect_windows import validate


class PublicationTests(unittest.TestCase):
    def test_source_artifact_and_reference_drift_are_refused(self):
        evidence = json.loads((check.OUT / 'evidence.json').read_text())
        check.validate_evidence(evidence)
        for section in ('sources', 'artifacts', 'references'):
            with self.subTest(section=section):
                changed = copy.deepcopy(evidence)
                changed[section][next(iter(changed[section]))] = '0' * 64
                with self.assertRaises(ValueError):
                    check.validate_evidence(changed)

    def test_native_claims_and_extra_private_fields_are_refused(self):
        inspected = json.loads((check.OUT / 'inspection.json').read_text())
        profile = json.loads((check.OUT / 'profile.json').read_text())
        validate(inspected)
        check.validate_profile(profile)
        for key in ('candidateExecuted', 'nativeHelpersObserved', 'effectiveConfigurationResolved',
                    'nativeExecutionAllowed', 'credentialContentsRead', 'keyringQueried'):
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    validate(dict(inspected, **{key: True}))
        for key in ('nativeAdmissionGranted', 'networkSilenceEstablished',
                    'credentialDiscoveryAbsenceEstablished', 'nativeExecutionAllowed'):
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    check.validate_profile(dict(profile, **{key: True}))
        with self.assertRaises(ValueError):
            validate(dict(inspected, privateRuntimeRoot='/private'))
