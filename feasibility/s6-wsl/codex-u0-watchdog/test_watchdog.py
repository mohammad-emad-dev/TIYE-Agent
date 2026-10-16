import ctypes
from ctypes import wintypes as W
import json
import os
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


class WatchdogTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='tiye-job-test-')
        self.root = Path(self.temporary.name)
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

    def launch(self, mode, seconds=4):
        config = {'argv': [sys.executable, '-I', '-S', '-B', str(SOURCE / 'peer.py'),
                           mode, str(self.root), self.nonce],
                  'cwd': str(self.root), 'nonce': self.nonce, 'seconds': seconds,
                  'ready': str(self.root / 'watchdog-ready.json'),
                  'report': str(self.root / 'report.json')}
        path = self.root / 'config.json'
        path.write_text(json.dumps(config), encoding='utf-8')
        process = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'watchdog.py'), str(path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(process)
        return process

    def read(self, name):
        deadline = time.monotonic() + 5
        path = self.root / name
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(path.exists(), 'Fixture record missing: ' + name)
        return json.loads(path.read_text(encoding='utf-8'))

    def held_identity(self, role):
        expected = self.read(role + '.json')
        self.assertEqual(expected['nonce'], self.nonce)
        handle = KERNEL.OpenProcess(0x100000 | 0x1000, False, expected['pid'])
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        self.handles.append(handle)
        times = [W.FILETIME() for unused in range(4)]
        if not KERNEL.GetProcessTimes(handle, *[ctypes.byref(item) for item in times]):
            raise ctypes.WinError(ctypes.get_last_error())
        creation = times[0].dwLowDateTime | (times[0].dwHighDateTime << 32)
        self.assertEqual(creation, expected['creationTime'])
        self.assertEqual(KERNEL.WaitForSingleObject(handle, 0), 258)
        return handle, expected

    def finish(self, process, expected_exit=0):
        stdout, stderr = process.communicate(timeout=8)
        self.assertEqual(process.returncode, expected_exit, stderr.decode('utf-8', errors='replace'))
        self.assertEqual(stdout, b'')
        report = self.read('report.json')
        self.assertTrue(report['windowsJobEmpty'])
        return report

    def test_normal_exit_is_observed_without_deadline_termination(self):
        watchdog = self.launch('normal')
        handle, expected = self.held_identity('root')
        (self.root / 'release-root').write_text('release', encoding='ascii')
        report = self.finish(watchdog)
        self.assertEqual(report['stopReason'], 'job-empty')
        self.assertEqual(report['finalRootExitCode'], 0)
        self.assertEqual(KERNEL.WaitForSingleObject(handle, 1000), 0)
        OBSERVATIONS.append({'case': 'normal', 'rootIdentity': expected, 'report': report,
                             'independentRootSignaled': True})

    def test_deadline_terminates_owned_root_and_descendant(self):
        watchdog = self.launch('hang', seconds=2)
        root_handle, root_id = self.held_identity('root')
        child_handle, child_id = self.held_identity('child')
        report = self.finish(watchdog, expected_exit=124)
        self.assertEqual(report['stopReason'], 'deadline')
        self.assertGreaterEqual(report['activeProcessesObservedBeforeStop'], 2)
        self.assertLess(report['stopDecisionLatenessSeconds'], 0.5)
        self.assertEqual(KERNEL.WaitForSingleObject(root_handle, 1000), 0)
        self.assertEqual(KERNEL.WaitForSingleObject(child_handle, 1000), 0)
        self.assertLess(report['elapsedSeconds'], 5)
        OBSERVATIONS.append({'case': 'deadline', 'identities': [root_id, child_id], 'report': report,
                             'independentHandlesSignaled': True})

    def test_root_exit_does_not_hide_live_descendant(self):
        watchdog = self.launch('root-exits', seconds=2)
        root_handle, root_id = self.held_identity('root')
        child_handle, child_id = self.held_identity('child')
        (self.root / 'release-root').write_text('release', encoding='ascii')
        self.assertEqual(KERNEL.WaitForSingleObject(root_handle, 1000), 0)
        self.assertEqual(KERNEL.WaitForSingleObject(child_handle, 0), 258)
        report = self.finish(watchdog, expected_exit=124)
        self.assertTrue(report['rootExitSeen'])
        self.assertEqual(report['rootExitCode'], 0)
        self.assertEqual(report['stopReason'], 'deadline')
        self.assertGreaterEqual(report['activeProcessesObservedBeforeStop'], 1)
        self.assertLess(report['stopDecisionLatenessSeconds'], 0.5)
        self.assertEqual(KERNEL.WaitForSingleObject(child_handle, 1000), 0)
        OBSERVATIONS.append({'case': 'root-exit-with-child', 'identities': [root_id, child_id],
                             'report': report, 'childObservedLiveAfterRootExit': True,
                             'independentHandlesSignaled': True})

    def test_nonzero_root_exit_is_not_replaced_with_cleanup_success(self):
        watchdog = self.launch('nonzero')
        handle, expected = self.held_identity('root')
        (self.root / 'release-root').write_text('release', encoding='ascii')
        report = self.finish(watchdog, expected_exit=7)
        self.assertEqual(report['stopReason'], 'job-empty')
        self.assertEqual(report['finalRootExitCode'], 7)
        self.assertEqual(KERNEL.WaitForSingleObject(handle, 1000), 0)
        OBSERVATIONS.append({'case': 'nonzero-exit', 'rootIdentity': expected,
                             'report': report, 'independentRootSignaled': True})

    def test_watchdog_crash_closes_job_and_spares_unrelated_process(self):
        sentinel = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'peer.py'),
            'sentinel', str(self.root), self.nonce], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(sentinel)
        sentinel_handle, sentinel_id = self.held_identity('sentinel')
        watchdog = self.launch('hang', seconds=30)
        root_handle, root_id = self.held_identity('root')
        child_handle, child_id = self.held_identity('child')
        watchdog.kill()
        watchdog.communicate(timeout=3)
        self.assertNotEqual(watchdog.returncode, 0)
        self.assertEqual(KERNEL.WaitForSingleObject(root_handle, 3000), 0)
        self.assertEqual(KERNEL.WaitForSingleObject(child_handle, 3000), 0)
        self.assertEqual(KERNEL.WaitForSingleObject(sentinel_handle, 0), 258)
        self.assertIsNone(sentinel.poll())
        self.assertFalse((self.root / 'report.json').exists())
        OBSERVATIONS.append({'case': 'watchdog-crash', 'identities': [root_id, child_id],
            'sentinelIdentity': sentinel_id, 'independentHandlesSignaled': True,
            'unrelatedSentinelStillLive': True, 'normalCompletionReportAbsent': True})

    def test_owner_crash_before_resume_terminates_never_started_child(self):
        owner = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'peer.py'),
            'suspended-owner', str(self.root), self.nonce], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(owner)
        handle, expected = self.held_identity('suspended')
        self.assertFalse((self.root / 'child.json').exists())
        owner.kill()
        owner.communicate(timeout=3)
        self.assertEqual(KERNEL.WaitForSingleObject(handle, 3000), 0)
        self.assertFalse((self.root / 'child.json').exists())
        OBSERVATIONS.append({'case': 'owner-crash-before-resume', 'rootIdentity': expected,
                             'independentRootSignaled': True, 'childCodeWitnessAbsent': True})


if __name__ == '__main__':
    unittest.main()
