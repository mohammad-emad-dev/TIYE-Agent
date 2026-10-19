"""Reject private/failed/promoted public records without opening raw captures."""
import copy
import unittest

import run


class PublicationTests(unittest.TestCase):
    def document(self):
        return {'schema': 'tiye-stream-writer-v1', 'sources': run.sources(),
                'tests': 8, 'cases': [{'case': name, 'verified': True} for name in run.CASES],
                'nativeExecutionAllowed': False, 'phase1': 'HOLD'}

    def test_private_or_unverified_case_is_refused(self):
        for change in ('private', 'failed', 'missing'):
            with self.subTest(change=change):
                document = self.document()
                if change == 'private':
                    document['cases'][0]['path'] = 'private-owned-fixture'
                elif change == 'failed':
                    document['cases'][0]['verified'] = False
                else:
                    document['cases'].pop()
                with self.assertRaises(ValueError):
                    run.validate(document)

    def test_admission_or_source_drift_is_refused(self):
        document = self.document()
        run.validate(document)
        for key, value in (('nativeExecutionAllowed', True), ('phase1', 'READY'), ('sources', {}), ('tests', True)):
            with self.subTest(field=key):
                changed = copy.deepcopy(document)
                changed[key] = value
                with self.assertRaises(ValueError):
                    run.validate(changed)


if __name__ == '__main__':
    unittest.main()
