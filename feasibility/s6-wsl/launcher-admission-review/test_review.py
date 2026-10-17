"""Regression checks for accidental admission and misleading evidence references."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import check
from validation import validate_review


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.document = check.read_json(check.OUT / 'readiness.json')

    def test_dated_review_validates_without_granting_execution(self):
        self.assertIsNone(validate_review(self.document))

    def test_promoted_state_or_removed_prerequisite_is_rejected(self):
        changes = [('decision', 'GO'), ('nativeAdmissionGranted', True), ('nativeU0Runs', False),
            ('scope', 'U0-no-auth-requests'), ('phase1', 'GO')]
        for key, value in changes:
            with self.subTest(key=key):
                document = copy.deepcopy(self.document)
                document[key] = value
                with self.assertRaises(ValueError):
                    validate_review(document)
        document = copy.deepcopy(self.document)
        document['requirements'][-1]['dependsOn'] = ['L1']
        with self.assertRaises(ValueError):
            validate_review(document)

    def test_evidence_paths_cannot_escape_or_redirect_a_cohort(self):
        for path in ('../private.json', '/absolute.json', 'C:/private.json', 'output/./x', 'x\x00y'):
            with self.subTest(path=path):
                document = copy.deepcopy(self.document)
                document['requirements'][0]['evidence'] = [path]
                with self.assertRaises(ValueError):
                    validate_review(document)
        cohort = copy.deepcopy(self.document['cohorts'][0])
        cohort['evidence'] = self.document['cohorts'][1]['evidence']
        with self.assertRaisesRegex(ValueError, 'cohort-reference-not-bound-to-id'):
            check.verify_cohort(check.ROOT, cohort)

    def test_modified_source_bytes_invalidate_saved_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'source.py'
            path.write_bytes(b'original\r\n')
            manifest = {'source.py': check.sha(path)}
            check.verify_hashes(root, manifest)
            path.write_bytes(b'original\n')
            with self.assertRaisesRegex(ValueError, 'reference-digest-mismatch'):
                check.verify_hashes(root, manifest)

    def test_duplicate_json_cannot_hide_an_earlier_decision(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'review.json'
            path.write_text('{"decision":"GO","decision":"HOLD"}', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'duplicate-json-key'):
                check.read_json(path)

    def test_result_missing_from_hash_manifest_cannot_count_as_evidence(self):
        cohort = self.document['cohorts'][0]
        evidence = check.read_json(check.ROOT / cohort['evidence'])
        evidence['artifactSha256'].pop('tests.stderr.bin')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / cohort['evidence']
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(evidence), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'cohort-result-not-hash-bound'):
                check.verify_cohort(root, cohort)


if __name__ == '__main__':
    unittest.main()
