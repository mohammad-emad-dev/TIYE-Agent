"""Three frozen launcher scenarios with protected allocation and private evidence."""
from pathlib import Path
import hashlib
import queue
import subprocess
import sys
import unittest
from unittest import mock
import uuid

ROOT = Path(__file__).resolve().parents[3]
LEGACY_SOURCE = ROOT / 'feasibility/s6-wsl/consolidated-launcher'
STORAGE_SOURCE = ROOT / 'feasibility/s6-wsl/private-capture-store'
sys.path[:0] = [str(LEGACY_SOURCE), str(STORAGE_SOURCE)]
import test_unified as legacy
from validation import validate_lifecycle
from private_storage import PrivateRun
import winacl

FINGERPRINT = None
RESULTS = []
METHODS = {'test_valid_handshake_has_peer_receipt_and_clean_completion': 'valid',
           'test_pending_stop_revokes_notification': 'stop-pending',
           'test_initialized_owner_loss_expires_lease': 'owner-loss'}


def validate_capture_record(record):
    validate_lifecycle(record)
    expected = {name: hashlib.sha256((LEGACY_SOURCE / name).read_bytes()).hexdigest() for name in legacy.FILES}
    if record['sourceSetSha256'] != FINGERPRINT or record['bundleSourceSha256'] != expected:
        raise ValueError('executed-source-not-bound')


class IntegratedTests(legacy.UnifiedTests):
    def setUp(self):
        self.private = PrivateRun(METHODS[self._testMethodName], FINGERPRINT)
        self.addCleanup(self.private.close)
        self.nonce = uuid.uuid4().hex
        self.root = self.private.path
        self.processes, self.handles, self.raw = [], [], []
        self.reader = self.diagnostic = self.watchdog_log = None
        self.messages = queue.Queue()
        self.prelaunch = self.private.verify_before_spawn()
        self.record_start = len(legacy.OBSERVATIONS)

    def prepare(self, mode):
        self.assertEqual(mode, self.private.mode)
        self.assertEqual(self.private.verify_before_spawn(), self.prelaunch)
        return super().prepare(mode)

    def tearDown(self):
        try:
            super().tearDown()
            self.assertEqual(len(legacy.OBSERVATIONS), self.record_start + 1)
            record = legacy.OBSERVATIONS[-1]
            validate_capture_record(record)
            self.private.write_record('private-evidence.json', record)
            self.private.write_record('witness.json', {
                'sourceSetSha256': FINGERPRINT, 'independentWitnessesValidated': True,
                'case': record['case'], 'ownerCompletionObserved': record['protocol'] is not None,
                'delivery': 'unknown', 'retentionRequired': True, 'deletionAllowed': False})
            self.private.write_record('storage-audit.json', {
                'sourceSetSha256': FINGERPRINT, 'files': self.private.audit_before_manifest(),
                'root': self.private.storage.security, 'run': self.private.security,
                'prelaunch': self.prelaunch, 'selfHashExcluded': True})
            audit = self.private.audit()
            from publication import select_public
            RESULTS.append(select_public(record, {'audit': audit, 'root': self.private.storage.security,
                'run': self.private.security, 'prelaunch': self.prelaunch}, FINGERPRINT))
        finally:
            self.private.close()


class StorageGateTests(unittest.TestCase):
    def test_storage_failure_prevents_any_process_spawn(self):
        with mock.patch.object(winacl.ADVAPI, 'GetSecurityInfo', return_value=5):
            with mock.patch.object(subprocess, 'Popen', side_effect=AssertionError('unexpected-child')) as spawn:
                with self.assertRaises(PermissionError):
                    PrivateRun('valid', FINGERPRINT)
                self.assertFalse(spawn.called)

    def test_changed_intent_refuses_before_spawn(self):
        private = PrivateRun('valid', FINGERPRINT)
        try:
            (private.path / 'retention.json').write_bytes(b'{}')
            with mock.patch.object(subprocess, 'Popen', side_effect=AssertionError('unexpected-child')) as spawn:
                with self.assertRaisesRegex(ValueError, 'private-intent-changed'):
                    private.verify_before_spawn()
                self.assertFalse(spawn.called)
        finally:
            private.close()


def suite(fingerprint):
    global FINGERPRINT
    FINGERPRINT = fingerprint
    legacy.SOURCE_SET_HASH = fingerprint
    return unittest.TestSuite([IntegratedTests(name) for name in METHODS] + [
        StorageGateTests('test_storage_failure_prevents_any_process_spawn'),
        StorageGateTests('test_changed_intent_refuses_before_spawn')])
