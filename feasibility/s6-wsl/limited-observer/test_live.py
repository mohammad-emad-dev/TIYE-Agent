"""Real bounded fixtures across independent observer, service and Windows guardian."""
import asyncio
import base64
import os
from pathlib import Path
import subprocess
import unittest

from bindings import composition
from case import LimitedRun

OBSERVATIONS, PRIVATE_RUNS, RETAINED = [], [], []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.session = None

    def tearDown(self):
        if self.session is not None:
            try:
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self, mode):
        self.session = LimitedRun(mode)
        self.session.launch_ack.set()
        selected = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        OBSERVATIONS.append(selected)
        self.assertTrue(selected['filesystemLimitsVerified'])
        self.assertTrue(selected['retainedSnapshotVerified'])
        self.assertTrue(selected['initializeResponseVerified'])
        self.assertFalse(selected['initializedPeerReceiptEstablished'])
        self.assertFalse(selected['candidateExecuted'])
        self.assertFalse(selected['nativeAdmissionGranted'])
        return selected

    def test_owner_exit_preserves_mount_evidence_after_service_cleanup(self):
        selected = self.execute('owner-exit')
        self.assertEqual(selected['outcome'], 'cleanup-observed')

    def test_stall_preserves_mount_evidence_before_windows_fallback(self):
        selected = self.execute('stall')
        self.assertEqual(selected['outcome'], 'cleanup-observed')
        self.assertTrue(self.session.witness['leaseExpiredBeforeWindowsDeadline'])

    def test_guardian_loss_keeps_job_unknown_despite_retention_success(self):
        selected = self.execute('guardian-loss')
        self.assertEqual(selected['outcome'], 'unknown')
        self.assertFalse(selected['cleanupVerified'])
        self.assertIsNone(self.session.witness['windowsJobEmpty'])


class TransferTests(unittest.TestCase):
    def test_invalid_transfers_close_every_received_descriptor(self):
        system = Path(os.environ['SystemRoot'])
        tests = base64.b64encode((composition.SOURCE / 'policy_tests.py').read_bytes())
        source = (composition.SOURCE / 'linux_runtime.py').read_bytes()
        source += b'\nexec(base64.b64decode(' + repr(tests).encode() + b'),NS)\nNS["mount_policy_tests"]()\n'
        self.assertLessEqual(len(source), 65536)
        boot = ('import sys;p=sys.stdin.buffer.read(65537);'
                'exec(compile(p,"fixed_transfer_checks","exec"),{"__name__":"fixed_policy_only"})')
        command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
                   '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
                   '-I', '-S', '-B', '-c', boot]
        checked = subprocess.run(command, input=source, capture_output=True, timeout=8,
            creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        self.assertEqual((checked.returncode, checked.stdout, checked.stderr), (0, b'POLICY-OK\n', b''))
