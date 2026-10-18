"""Offline confidentiality boundary for selected synthetic publication."""
import copy
import json
import unittest

import run
from publication import select_public


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.records = json.loads((run.OUT / 'observations.json').read_text(encoding='utf-8'))

    def test_saved_capture_verifies(self):
        self.assertEqual(run.check(), 0)

    def test_unreviewed_raw_field_is_refused(self):
        changed = copy.deepcopy(self.records)
        changed[0]['rawBase64'] = 'synthetic-content-canary'
        with self.assertRaisesRegex(ValueError, 'unreviewed-or-failing-verdict'):
            select_public(changed)

    def test_identity_value_and_extra_metadata_are_refused(self):
        changed = copy.deepcopy(self.records)
        owner = next(record for record in changed if record['case'] == 'owner-io')
        owner['parentBefore']['aces'][0]['role'] = 'synthetic-account-name'
        with self.assertRaisesRegex(ValueError, 'unreviewed-security-principal'):
            select_public(changed)
        owner['parentBefore']['aces'][0]['role'] = 'current-user'
        owner['parentBefore']['absolutePath'] = 'synthetic-private-path'
        with self.assertRaisesRegex(ValueError, 'unreviewed-security-field'):
            select_public(changed)


if __name__ == '__main__':
    unittest.main()
