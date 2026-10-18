"""Valid protocol peer probes owned canaries within the managed mock path."""
import hashlib
import json
from pathlib import Path
import queue
import sys
import unittest
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
LAUNCHER = SOURCE / 'launcher'
sys.path[:0] = [str(LAUNCHER), str(ROOT / 'feasibility/s6-wsl/private-capture-store')]
import test_unified as legacy
from validation import validate_lifecycle
from private_storage import PrivateRun
from publication import validate_ambient, select_public

FINGERPRINT = None
RESULTS = []


class AmbientTest(legacy.UnifiedTests):
    def setUp(self):
        self.private = PrivateRun('valid', FINGERPRINT)
        self.addCleanup(self.private.close)
        self.nonce, self.root = uuid.uuid4().hex, self.private.path
        self.processes, self.handles, self.raw = [], [], []
        self.reader = self.diagnostic = self.watchdog_log = None
        self.messages = queue.Queue()
        self.prelaunch = self.private.verify_before_spawn()
        self.record_start = len(legacy.OBSERVATIONS)

    def prepare(self, mode):
        self.assertEqual(mode, 'valid')
        self.assertEqual(self.private.verify_before_spawn(), self.prelaunch)
        return super().prepare(mode)

    def tearDown(self):
        try:
            super().tearDown()
            self.assertEqual(len(legacy.OBSERVATIONS), self.record_start + 1)
            record = legacy.OBSERVATIONS[-1]
            validate_lifecycle(record)
            expected = {name: hashlib.sha256((LAUNCHER / name).read_bytes()).hexdigest() for name in legacy.FILES}
            self.assertEqual(record['sourceSetSha256'], FINGERPRINT)
            self.assertEqual(record['bundleSourceSha256'], expected)
            ambient = [json.loads(raw) for raw in self.raw if json.loads(raw)['event'] == 'ambient']
            self.assertEqual(len(ambient), 1)
            validate_ambient(record, ambient[0])
            self.private.write_record('private-evidence.json', record)
            self.private.write_record('ambient-evidence.json', ambient[0])
            self.private.write_record('witness.json', {'sourceSetSha256': FINGERPRINT,
                'lifecycleValidated': True, 'ownedResourcesValidated': True,
                'delivery': 'unknown', 'retentionRequired': True, 'deletionAllowed': False})
            self.private.write_record('storage-audit.json', {'sourceSetSha256': FINGERPRINT,
                'files': self.private.audit_before_manifest(), 'root': self.private.storage.security,
                'run': self.private.security, 'prelaunch': self.prelaunch, 'selfHashExcluded': True})
            audit = self.private.audit()
            RESULTS.append(select_public(record, ambient[0], {'audit': audit, 'prelaunch': self.prelaunch}, FINGERPRINT))
        finally:
            self.private.close()


def suite(fingerprint):
    global FINGERPRINT
    FINGERPRINT = fingerprint
    legacy.SOURCE_SET_HASH = fingerprint
    legacy.FILES = tuple(legacy.profile.BUNDLE_FILES) + ('ambient_probe.py',)
    legacy.BOOTSTRAP = (SOURCE / 'resource_bootstrap.py').read_text(encoding='utf-8')
    return unittest.TestSuite([AmbientTest('test_valid_handshake_has_peer_receipt_and_clean_completion')])
