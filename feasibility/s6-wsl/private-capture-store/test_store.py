"""Actual Windows objects with synthetic payloads; no alternate-account assertion."""
import contextlib
import ctypes
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock
import uuid

import store
import winacl

OBSERVATIONS = []
PAYLOAD = b'TIYE synthetic storage canary\n'


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.storage = store.create_store()
        self.addCleanup(self.storage.close)

    def launch(self, code):
        system = os.environ['SystemRoot']
        child = subprocess.Popen([sys.executable, '-I', '-S', '-B', '-c', code],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={'SystemRoot': system, 'WINDIR': system, 'PATH': system + '/System32'})
        output, errors = child.communicate(timeout=10)
        self.assertEqual(errors, b'')
        return child, output

    def clean_completed(self, run):
        outcome = store.delete_reviewed_run(run)
        self.assertTrue(run.path.exists())
        self.storage.close()
        run.path.rmdir()
        self.storage.path.rmdir()
        return outcome

    def test_owner_io_and_completion_gate_precede_explicit_cleanup(self):
        parent_handle = winacl.open_directory(self.storage.path.parent)
        try:
            before = winacl.snapshot(parent_handle, self.storage.owner)
        finally:
            winacl.close(parent_handle)
        run = self.storage.new_run(uuid.uuid4().hex)
        retention = json.loads(run.read_bytes('retention.json'))
        self.assertTrue(retention['uncertainOperation'])
        self.assertFalse(retention['automaticDeletion'])
        child, output = self.launch('import sys; sys.stdout.buffer.write(' + repr(PAYLOAD) + ')')
        self.assertEqual(child.returncode, 0)
        run.write_bytes('stdout.bin', output)
        self.assertEqual(run.read_bytes('stdout.bin'), PAYLOAD)
        run.record_completed_child(child)
        with self.assertRaisesRegex(ValueError, 'closed-run-or-invalid-payload'):
            run.write_bytes('stderr.bin', b'late payload')
        observed = {'case': 'owner-io', 'parentBefore': before, 'root': self.storage.security,
                    'run': run.security, 'files': run.file_security, 'ownerReadWrite': True,
                    'childReturnCode': child.returncode, 'rawPayloadExported': False}
        observed['cleanup'] = self.clean_completed(run)
        OBSERVATIONS.append(observed)

    def test_permission_api_failures_leave_no_run_or_payload(self):
        def deny_create(*unused):
            ctypes.set_last_error(5)
            return 0
        boundaries = ((winacl.KERNEL, 'CreateDirectoryW', deny_create),
                      (winacl.ADVAPI, 'GetSecurityInfo', lambda *unused: 5))
        for library, name, failure in boundaries:
            with self.subTest(boundary=name):
                identity = uuid.uuid4().hex
                with mock.patch.object(library, name, side_effect=failure):
                    with self.assertRaises(PermissionError):
                        self.storage.new_run(identity)
                self.assertFalse((self.storage.path / identity).exists())
                self.assertEqual(list(self.storage.path.iterdir()), [])
        self.storage.close()
        self.storage.path.rmdir()
        OBSERVATIONS.append({'case': 'permission-failures', 'boundaries': ['CreateDirectoryW', 'GetSecurityInfo'],
                             'payloadCreated': False, 'runCreated': False})

    def test_existing_run_is_refused_without_mutation(self):
        identity = uuid.uuid4().hex
        run = self.storage.new_run(identity)
        before = run.read_bytes('retention.json')
        with self.assertRaises(FileExistsError):
            store.CaptureStore(self.storage.path.name.removeprefix('tiye-private-capture-'))
        with self.assertRaises(FileExistsError):
            self.storage.new_run(identity)
        self.assertEqual(run.read_bytes('retention.json'), before)
        self.assertEqual(winacl.verify_directory(run.handle, self.storage.owner), run.security)
        run.write_bytes('stdout.bin', PAYLOAD)
        with self.assertRaises(FileExistsError):
            run.write_bytes('stdout.bin', b'replacement')
        self.assertEqual(run.read_bytes('stdout.bin'), PAYLOAD)
        OBSERVATIONS.append({'case': 'existing-run', 'bytesUnchanged': True, 'descriptorUnchanged': True})

    def test_file_query_failure_leaves_empty_file_without_payload(self):
        run = self.storage.new_run(uuid.uuid4().hex)
        original = winacl.ADVAPI.GetSecurityInfo

        def query_or_deny(handle, *arguments):
            if not winacl.file_information(handle).attributes & 0x10:
                return 5
            return original(handle, *arguments)

        with mock.patch.object(winacl.ADVAPI, 'GetSecurityInfo', side_effect=query_or_deny):
            with self.assertRaises(PermissionError):
                run.write_bytes('stdout.bin', PAYLOAD)
        self.assertEqual((run.path / 'stdout.bin').stat().st_size, 0)
        self.assertNotIn('stdout.bin', run.file_security)
        OBSERVATIONS.append({'case': 'file-query-failure', 'emptyFileRetained': True, 'payloadWritten': False})

    def test_owner_mismatch_refuses_before_run_creation(self):
        identity = uuid.uuid4().hex
        original = self.storage.owner
        try:
            self.storage.owner = 'S-1-0-0'
            with self.assertRaisesRegex(ValueError, 'directory-security-mismatch'):
                self.storage.new_run(identity)
        finally:
            self.storage.owner = original
        self.assertFalse((self.storage.path / identity).exists())
        self.storage.close()
        self.storage.path.rmdir()
        OBSERVATIONS.append({'case': 'owner-mismatch', 'payloadCreated': False})

    def test_actual_junction_is_refused_and_target_unchanged(self):
        target = self.storage.path / 'junction-target'
        winacl.create_directory(target, self.storage.owner)
        marker = target / 'synthetic-marker.txt'
        marker.write_bytes(PAYLOAD)
        identity = uuid.uuid4().hex
        junction = self.storage.path / identity
        script = ("Import-Module \"$PSHOME/Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1\"; "
                  "$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd() | ConvertFrom-Json; "
                  "New-Item -ItemType Junction -Path $p.link -Target $p.target | Out-Null")
        system = Path(os.environ['SystemRoot'])
        subprocess.run([str(system / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
            '-NoProfile', '-NonInteractive', '-Command', script],
            input=json.dumps({'link': str(junction), 'target': str(target)}),
            encoding='utf-8', capture_output=True, timeout=15, check=True)
        with contextlib.ExitStack() as held:
            handle = winacl.open_directory(junction)
            held.callback(winacl.close, handle)
            with self.assertRaisesRegex(ValueError, 'reparse-point-refused'):
                winacl.verify_directory(handle, self.storage.owner)
        with self.assertRaises(FileExistsError):
            self.storage.new_run(identity)
        self.assertEqual(marker.read_bytes(), PAYLOAD)
        self.assertEqual({path.name for path in target.iterdir()}, {'synthetic-marker.txt'})
        junction.rmdir()
        marker.unlink()
        target.rmdir()
        self.storage.close()
        self.storage.path.rmdir()
        OBSERVATIONS.append({'case': 'junction', 'actualReparseRefused': True, 'targetUnchanged': True})

    def test_failed_child_keeps_uncertain_capture(self):
        run = self.storage.new_run(uuid.uuid4().hex)
        child, output = self.launch('import sys; sys.stdout.write("synthetic partial"); sys.exit(7)')
        self.assertEqual(child.returncode, 7)
        run.write_bytes('stdout.bin', output)
        with self.assertRaisesRegex(ValueError, 'successful-child-completion-required'):
            run.record_completed_child(child)
        with self.assertRaisesRegex(ValueError, 'uncertain-capture-must-be-retained'):
            store.delete_reviewed_run(run)
        self.assertEqual(run.read_bytes('stdout.bin'), output)
        self.assertFalse((run.path / 'completion.json').exists())
        OBSERVATIONS.append({'case': 'uncertain-retention', 'childReturnCode': 7,
                             'payloadRetained': True, 'completionAbsent': True})

    def test_cleanup_failure_is_reported_and_retention_survives(self):
        run = self.storage.new_run(uuid.uuid4().hex)
        child, output = self.launch('print("synthetic completed")')
        run.write_bytes('stdout.bin', output)
        run.record_completed_child(child)
        locked = winacl.open_file(run.path / 'stdout.bin')
        try:
            with self.assertRaises(PermissionError):
                store.delete_reviewed_run(run)
            self.assertEqual(run.read_bytes('retention.json'), (run.path / 'retention.json').read_bytes())
            self.assertTrue((run.path / 'completion.json').exists())
            self.assertEqual(run.read_bytes('stdout.bin'), output)
        finally:
            winacl.close(locked)
        cleanup = self.clean_completed(run)
        OBSERVATIONS.append({'case': 'cleanup-failure', 'failureReported': True,
                             'retentionSurvivedFailure': True, 'retryAfterUnlock': cleanup})


if __name__ == '__main__':
    unittest.main()
