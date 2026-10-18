"""Regressions for review overclaims and tampered evidence references."""
import copy
import json
import unittest

import check


class ReviewChecks(unittest.TestCase):
    def setUp(self):
        self.review = json.loads((check.OUT / 'review.json').read_text(encoding='utf-8'))
        self.measurements = json.loads((check.OUT / 'measurements.json').read_text(encoding='utf-8'))

    def test_saved_review_verifies(self):
        check.check()

    def test_admission_or_privacy_promotion_is_refused(self):
        mutations = {'nativeAdmissionGranted': True, 'nativeProviderRuns': 1,
                     'phase1': 'READY', 'P1': 'CLOSED', 'P2': 'CLOSED',
                     'currentEffectiveAccessEvaluated': True,
                     'historicalEffectiveAccessProven': True}
        for key, replacement in mutations.items():
            with self.subTest(key=key):
                changed = copy.deepcopy(self.review)
                changed['limits'][key] = replacement
                with self.assertRaisesRegex(ValueError, 'cannot-promote'):
                    check.validate_review(changed, self.measurements)

    def test_missing_acl_and_historical_scope_are_refused(self):
        changed = copy.deepcopy(self.measurements)
        changed['windowsDacl'].pop()
        with self.assertRaisesRegex(ValueError, 'acl-target-coverage'):
            check.validate_review(self.review, changed)
        changed = copy.deepcopy(self.measurements)
        changed['linuxMetadata']['scope'] = 'historical-service'
        with self.assertRaisesRegex(ValueError, 'linux-scope-mismatch'):
            check.validate_review(self.review, changed)

    def test_changed_subject_hash_is_refused(self):
        changed = copy.deepcopy(self.review)
        name = next(iter(changed['subjectArtifacts']))
        changed['subjectArtifacts'][name] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'subject-inventory-mismatch'):
            check.validate_review(changed, self.measurements)

    def test_path_escape_and_changed_bytes_are_refused(self):
        for name in ('../outside', '/absolute', 'C:/outside', 'output/../outside', 'output\\outside'):
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, 'invalid-manifest-entry'):
                    check.verify_manifest({name: '0' * 64})
        with self.assertRaisesRegex(ValueError, 'manifest-content-changed'):
            check.verify_manifest({'output/s6-consolidated-launcher/README.md': '0' * 64})

    def test_private_retention_claim_is_refused(self):
        changed = copy.deepcopy(self.review)
        changed['retention']['publishedArtifactsArePrivate'] = True
        with self.assertRaisesRegex(ValueError, 'retention-overclaim'):
            check.validate_review(changed, self.measurements)

    def test_measurement_overclaims_and_identity_fields_are_refused(self):
        for key, replacement in (('nativeAdmissionGranted', True), ('nativeProviderRuns', False)):
            with self.subTest(key=key):
                changed = copy.deepcopy(self.measurements)
                changed['limits'][key] = replacement
                with self.assertRaisesRegex(ValueError, 'cannot-promote'):
                    check.validate_review(self.review, changed)
        changed = copy.deepcopy(self.measurements)
        changed['windowsDacl'][0]['aces'][0]['sid'] = 'synthetic-identity-canary'
        with self.assertRaisesRegex(ValueError, 'invalid-ace'):
            check.validate_review(self.review, changed)

    def test_absent_path_cannot_contain_file_bytes_or_imply_effective_access(self):
        changed = copy.deepcopy(self.measurements)
        first = next(iter(changed['linuxMetadata']['roots'].values()))
        first['.'] = {'exists': False, 'contents': 'synthetic-content-canary'}
        with self.assertRaisesRegex(ValueError, 'invalid-linux-metadata'):
            check.validate_review(self.review, changed)
        changed = copy.deepcopy(self.measurements)
        changed['linuxMetadata']['effectiveAccessEvaluated'] = True
        with self.assertRaisesRegex(ValueError, 'linux-scope-mismatch'):
            check.validate_review(self.review, changed)


if __name__ == '__main__':
    unittest.main()
