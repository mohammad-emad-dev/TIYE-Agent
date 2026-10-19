"""Offline source/config and public-scope refusal checks; no child processes."""
import copy
import unittest

import composition
import run


class PublicationTests(unittest.TestCase):
    def document(self):
        sources = composition.sources()
        return {'schema': 'tiye-stream-launcher-v1', 'sources': sources,
                'composition': composition.fingerprint(sources), 'nativeExecutionAllowed': False, 'phase1': 'HOLD',
                'cases': [{'case': name, 'cleanupVerified': True, 'restartRefused': True,
                           'privatePrefixRetained': True, 'storageCompleted': name == 'valid',
                           'ownerFinalResultAbsent': name == 'owner-loss', 'overflowObserved': name == 'stderr-overflow'}
                          for name in run.CASES]}

    def test_private_fields_failed_cleanup_and_false_completion_refused(self):
        changes = [('path', 'private'), ('cleanupVerified', False), ('storageCompleted', True)]
        for key, value in changes:
            with self.subTest(field=key):
                document = self.document()
                document['cases'][2][key] = value
                with self.assertRaises(ValueError):
                    run.validate(document)

    def test_source_case_and_admission_promotion_refused(self):
        original = self.document()
        run.validate(original)
        for key, value in (('nativeExecutionAllowed', True), ('sources', {}), ('cases', []), ('phase1', 'READY')):
            with self.subTest(field=key):
                document = copy.deepcopy(original)
                document[key] = value
                with self.assertRaises(ValueError):
                    run.validate(document)

    def test_changed_source_or_scenario_config_refused_before_launch(self):
        sources = composition.sources()
        config = {'linuxRoot': '/unused', 'windowsRoot': 'unused', 'nonce': 'a' * 32,
                  'mode': 'valid', 'scenario': 'valid', 'sourceSha256': sources,
                  'composition': composition.fingerprint(sources), 'captureParent': 'unused'}
        composition.validate(config)
        for key, value in (('mode', 'owner-loss'), ('sourceSha256', {}), ('composition', '0' * 64), ('native', True)):
            with self.subTest(field=key):
                changed = copy.deepcopy(config)
                changed[key] = value
                with self.assertRaises(ValueError):
                    composition.validate(changed)

    def test_stale_writer_or_watchdog_binding_refused(self):
        pairs = [({'nonce': 'old', 'rootPid': 10}, {'nonce': 'new', 'rootPid': 10}),
                 ({'nonce': 'same', 'rootPid': 11}, {'nonce': 'same', 'rootPid': 10}),
                 ({'nonce': 'same', 'configSha256': 'old'}, {'nonce': 'same', 'configSha256': 'new'})]
        for record, expected in pairs:
            with self.subTest(expected=expected), self.assertRaises(ValueError):
                composition.validate_result(record, expected)


if __name__ == '__main__':
    unittest.main()
