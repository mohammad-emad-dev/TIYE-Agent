"""Real Windows pipe and process integration; no WSL or provider invocation."""
import ctypes
from ctypes import wintypes as W
import json
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
OBSERVATIONS = []
KERNEL = ctypes.WinDLL('kernel32', use_last_error=True)
KERNEL.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
KERNEL.OpenProcess.restype = W.HANDLE
KERNEL.CloseHandle.argtypes = [W.HANDLE]
KERNEL.CloseHandle.restype = W.BOOL
KERNEL.WaitForSingleObject.argtypes = [W.HANDLE, W.DWORD]
KERNEL.WaitForSingleObject.restype = W.DWORD
KERNEL.GetProcessTimes.argtypes = [W.HANDLE] + [ctypes.POINTER(W.FILETIME)] * 4
KERNEL.GetProcessTimes.restype = W.BOOL


class IntegratedTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='tiye-u0-integrated-')
        self.folder = Path(self.temporary.name)
        self.nonce = uuid.uuid4().hex
        self.processes = []
        self.handles = []

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)
        for handle in self.handles:
            if not KERNEL.CloseHandle(handle):
                raise ctypes.WinError(ctypes.get_last_error())
        self.temporary.cleanup()

    def read(self, name):
        path = self.folder / name
        deadline = time.monotonic() + 5
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(path.exists(), 'Missing fixture record: ' + name)
        return json.loads(path.read_text(encoding='utf-8'))

    def launch(self, mode, seconds=6):
        command = [sys.executable, '-I', '-S', '-B', str(SOURCE / 'run.py'),
                   '--synthetic', mode, '--directory', str(self.folder),
                   '--nonce', self.nonce, '--seconds', str(seconds)]
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(process)
        return process

    def hold(self, role):
        identity = self.read(role + '.json')
        self.assertEqual(identity['nonce'], self.nonce)
        handle = KERNEL.OpenProcess(0x100000 | 0x1000, False, identity['pid'])
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        self.handles.append(handle)
        times = [W.FILETIME() for unused in range(4)]
        if not KERNEL.GetProcessTimes(handle, *[ctypes.byref(t) for t in times]):
            raise ctypes.WinError(ctypes.get_last_error())
        creation = times[0].dwLowDateTime | (times[0].dwHighDateTime << 32)
        self.assertEqual(creation, identity['creationTime'])
        self.assertEqual(KERNEL.WaitForSingleObject(handle, 0), 258)
        return handle, identity

    def finish(self, process, exit_code):
        stdout, stderr = process.communicate(timeout=8)
        self.assertEqual(process.returncode, exit_code, stderr.decode('utf-8', errors='replace'))
        self.assertEqual(stdout, b'')
        report = self.read('watchdog-report.json')
        self.assertTrue(report['windowsJobEmpty'])
        self.assertTrue(report['rootHandleSignaled'])
        return report

    def assert_dead(self, *handles):
        for handle in handles:
            self.assertEqual(KERNEL.WaitForSingleObject(handle, 1000), 0)

    def test_valid_foreign_and_corrupt_reports_preserve_protocol_outcomes(self):
        for mode, exit_code in [('valid', 0), ('foreign', 1), ('invalid-raw', 1)]:
            with self.subTest(mode=mode):
                # Each attempt has a fresh manifest and nonce rather than reusing a run.
                if mode != 'valid':
                    self.folder = Path(self.temporary.name) / mode
                    self.folder.mkdir()
                    self.nonce = uuid.uuid4().hex
                watchdog = self.launch(mode)
                host_handle, host_id = self.hold('host')
                worker_handle, worker_id = self.hold('worker')
                (self.folder / 'release').write_text('release', encoding='ascii')
                report = self.finish(watchdog, exit_code)
                host = self.read('host-result.json')
                self.assertEqual(host['nonce'], self.nonce)
                self.assertIsNone(host['host']['fault'])
                self.assertTrue(host['host']['directChildReaped'])
                self.assertTrue(all(host['host']['readerEof'].values()))
                observation = host['worker']['observation']
                self.assertEqual(observation['handshakeAccepted'], mode != 'foreign')
                self.assertEqual(observation['initializedWitness'], mode != 'foreign')
                self.assertEqual(host['syntheticProtocolObserved'], mode == 'valid')
                self.assertEqual(len(observation['writes']), 1 if mode == 'foreign' else 2)
                self.assertEqual(observation['fault'], None if mode != 'foreign'
                                 else 'uncorrelated-or-error-response')
                if mode == 'invalid-raw':
                    self.assertTrue(host['protocolValidationFault'])
                else:
                    self.assertIsNone(host['protocolValidationFault'])
                self.assertEqual(report['stopReason'], 'job-empty')
                self.assert_dead(host_handle, worker_handle)
                OBSERVATIONS.append({'case': mode, 'host': host, 'watchdog': report,
                    'identities': [host_id, worker_id], 'independentHandlesSignaled': True})

    def test_blocked_host_is_stopped_with_worker_and_peer(self):
        watchdog = self.launch('blocked', seconds=2)
        owned = [self.hold(role) for role in ['host', 'worker', 'peer']]
        report = self.finish(watchdog, 124)
        self.assertEqual(report['stopReason'], 'deadline')
        self.assertGreaterEqual(report['activeProcessesObservedBeforeStop'], 3)
        self.assertLess(report['stopDecisionLatenessSeconds'], 0.5)
        self.assertLess(report['elapsedSeconds'], 5)
        self.assert_dead(*(handle for handle, identity in owned))
        self.assertFalse((self.folder / 'host-result.json').exists())
        OBSERVATIONS.append({'case': 'blocked-host', 'watchdog': report,
            'identities': [identity for handle, identity in owned],
            'independentHandlesSignaled': True, 'hostCompletionReportAbsent': True})

    def test_host_exit_does_not_hide_live_worker_and_peer(self):
        watchdog = self.launch('root-exits', seconds=2)
        # Host awaits this marker so all handles can be held before it exits.
        owned = [self.hold(role) for role in ['host', 'worker', 'peer']]
        (self.folder / 'release').write_text('release', encoding='ascii')
        self.assertEqual(KERNEL.WaitForSingleObject(owned[0][0], 1000), 0)
        for handle, identity in owned[1:]:
            self.assertEqual(KERNEL.WaitForSingleObject(handle, 0), 258)
        report = self.finish(watchdog, 124)
        self.assertEqual(report['rootExitCode'], 7)
        self.assertEqual(report['finalRootExitCode'], 7)
        self.assertEqual(report['stopReason'], 'deadline')
        self.assertLess(report['stopDecisionLatenessSeconds'], 0.5)
        self.assert_dead(*(handle for handle, identity in owned))
        self.assertFalse((self.folder / 'host-result.json').exists())
        OBSERVATIONS.append({'case': 'host-exit-with-descendants', 'watchdog': report,
            'identities': [identity for handle, identity in owned],
            'descendantsObservedLiveAfterHostExit': True, 'independentHandlesSignaled': True})

    def test_watchdog_crash_stops_integrated_tree_and_spares_sentinel(self):
        sentinel = subprocess.Popen([sys.executable, '-I', '-S', '-B',
            str(SOURCE.parent / 'codex-u0-watchdog-v2/peer.py'), 'sentinel',
            str(self.folder), self.nonce], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(sentinel)
        sentinel_handle, sentinel_id = self.hold('sentinel')
        watchdog = self.launch('blocked', seconds=10)
        owned = [self.hold(role) for role in ['host', 'worker', 'peer']]
        watchdog.kill()
        watchdog.communicate(timeout=3)
        self.assertNotEqual(watchdog.returncode, 0)
        for handle, identity in owned:
            self.assertEqual(KERNEL.WaitForSingleObject(handle, 3000), 0)
        self.assertEqual(KERNEL.WaitForSingleObject(sentinel_handle, 0), 258)
        self.assertIsNone(sentinel.poll())
        self.assertFalse((self.folder / 'watchdog-report.json').exists())
        self.assertFalse((self.folder / 'host-result.json').exists())
        OBSERVATIONS.append({'case': 'watchdog-crash', 'identities': [i for h, i in owned],
            'sentinelIdentity': sentinel_id, 'independentHandlesSignaled': True,
            'unrelatedSentinelStillLive': True, 'normalCompletionReportAbsent': True})

    def test_native_capture_refuses_without_creating_launch_artifacts(self):
        process = subprocess.run([sys.executable, '-I', '-S', '-B', str(SOURCE / 'run.py'),
            '--capture', '--directory', str(self.folder)], stdin=subprocess.DEVNULL,
            capture_output=True, timeout=3, creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(process.returncode, 2)
        self.assertIn(b'native-capture-disabled', process.stderr)
        self.assertEqual(list(self.folder.iterdir()), [])
        OBSERVATIONS.append({'case': 'native-refusal', 'exitCode': 2, 'launchArtifactsAbsent': True})

    def test_existing_run_record_refuses_relaunch(self):
        original = b'{"priorAttempt":"uncertain"}\n'
        manifest = self.folder / 'input.json'
        manifest.write_bytes(original)
        watchdog = self.launch('valid')
        stdout, stderr = watchdog.communicate(timeout=3)
        self.assertNotEqual(watchdog.returncode, 0)
        self.assertIn(b'FileExistsError', stderr)
        self.assertEqual(manifest.read_bytes(), original)
        self.assertEqual({path.name for path in self.folder.iterdir()}, {'input.json'})
        OBSERVATIONS.append({'case': 'relaunch-refusal', 'priorRecordUnchanged': True,
                             'launchArtifactsAbsent': True})


if __name__ == '__main__':
    unittest.main()
