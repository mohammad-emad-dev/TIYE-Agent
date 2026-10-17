"""Independent pidfd observers for the controlled Linux ownership cases."""
import io
import json
import os
import select
import signal
import subprocess
import sys
import time
import unittest
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
OBSERVATIONS = []


def read_record(path):
    deadline = time.monotonic() + 3
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    return json.loads(path.read_text())


def hold(path, nonce):
    expected = read_record(path)
    if expected['nonce'] != nonce:
        raise ValueError('observer-nonce-mismatch')
    fd = os.pidfd_open(expected['pid'])
    try:
        actual = Path('/proc') / str(expected['pid'])
        fields = (actual / 'stat').read_text().rsplit(')', 1)[1].split()
        if int(fields[19]) != expected['startTicks'] or select.select([fd], [], [], 0)[0]:
            raise ValueError('observer-process-not-matching-live-instance')
    except (OSError, ValueError):
        os.close(fd)
        raise
    return fd, expected


class LinuxOwnerTests(unittest.TestCase):
    def setUp(self):
        self.folder = SOURCE / ('case-' + uuid.uuid4().hex)
        self.folder.mkdir(mode=0o700)
        self.nonce = uuid.uuid4().hex
        self.processes = []
        self.fds = []
        self.sentinel = self.launch('peer.py', 'sentinel')
        self.sentinel_fd, self.sentinel_identity = hold(self.folder / 'sentinel.json', self.nonce)
        self.fds.append(self.sentinel_fd)

    def launch(self, filename, mode):
        child = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / filename),
            mode, str(self.folder), self.nonce], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
        self.processes.append(child)
        return child

    def tearDown(self):
        for child in self.processes:
            if child.poll() is None:
                child.kill()
            child.communicate(timeout=3)
        for fd in self.fds:
            os.close(fd)
        # Marker-owned fixtures are retained rather than recursively deleted.

    def prepare(self, mode):
        supervisor = self.launch('supervisor.py', mode)
        ready = read_record(self.folder / 'supervisor-ready.json')
        self.assertEqual(ready['nonce'], self.nonce)
        root_fd, root_id = hold(self.folder / 'root.json', self.nonce)
        self.fds.append(root_fd)
        leaves = []
        if mode != 'normal':
            for name in ['leaf', 'leaf2'] if mode == 'mismatch' else ['leaf']:
                leaf = hold(self.folder / (name + '.json'), self.nonce)
                leaves.append(leaf)
                self.fds.append(leaf[0])
                self.assertNotEqual(root_id['sid'], leaf[1]['sid'])
        (self.folder / 'release').write_text('release')
        self.assertTrue(select.select([root_fd], [], [], 1)[0])
        for leaf in leaves:
            deadline = time.monotonic() + 1
            while time.monotonic() < deadline:
                stat = Path('/proc') / str(leaf[1]['pid']) / 'stat'
                if int(stat.read_text().rsplit(')', 1)[1].split()[1]) == supervisor.pid:
                    break
                time.sleep(0.01)
            self.assertEqual(int(stat.read_text().rsplit(')', 1)[1].split()[1]), supervisor.pid)
            self.assertFalse(select.select([leaf[0]], [], [], 0)[0])
        return supervisor, root_id, leaves

    def finish(self, prepared, mode):
        supervisor, root_id, leaves = prepared
        stdout, stderr = supervisor.communicate(timeout=4)
        self.assertEqual(supervisor.returncode, 0, stderr.decode(errors='replace'))
        self.assertEqual(stdout, b'')
        result = read_record(self.folder / 'result.json')
        self.assertEqual(result['nonce'], self.nonce)
        self.assertTrue(result['observedEmpty'])
        self.assertEqual(result['after']['rootExitCode'], 0 if mode == 'normal' else 7)
        self.assertEqual(result['after']['liveCount'], 0)
        self.assertTrue(all(row['exitCode'] is not None for row in result['after']['identities']))
        self.assertLess(result['elapsedSeconds'], 5)
        for leaf in leaves:
            self.assertTrue(select.select([leaf[0]], [], [], 0)[0])
            self.assertFalse((Path('/proc') / str(leaf[1]['pid'])).exists())
        self.assertFalse(select.select([self.sentinel_fd], [], [], 0)[0])
        self.assertIsNone(self.sentinel.poll())
        OBSERVATIONS.append({'case': mode, 'rootIdentity': root_id,
            'leafIdentities': [leaf[1] for leaf in leaves], 'result': result,
            'leafIndependentlySignaledAndAbsent': bool(leaves),
            'unrelatedSentinelLive': True, 'sentinelIdentity': self.sentinel_identity})
        return result

    def test_normal_root_exit_is_reaped_without_signaling(self):
        prepared = self.prepare('normal')
        (self.folder / 'stop').write_text('stop')
        result = self.finish(prepared, 'normal')
        self.assertEqual(result['termSignals'], 0)
        self.assertEqual(result['killSignals'], 0)

    def test_root_exit_preserves_live_setsid_descendant_until_cleanup(self):
        prepared = self.prepare('adopted')
        (self.folder / 'stop').write_text('stop')
        result = self.finish(prepared, 'adopted')
        self.assertEqual(result['before']['rootExitCode'], 7)
        self.assertEqual(result['termSignals'], 1)
        self.assertEqual(result['killSignals'], 0)

    def test_term_ignoring_adopted_child_requires_pidfd_kill(self):
        prepared = self.prepare('escalate')
        (self.folder / 'stop').write_text('stop')
        result = self.finish(prepared, 'escalate')
        self.assertEqual(result['termSignals'], 1)
        self.assertEqual(result['killSignals'], 1)
        exits = [row['exitCode'] for row in result['after']['identities'] if row['pid'] != result['after']['rootPid']]
        self.assertEqual(exits, [-signal.SIGKILL])

    def test_identity_mismatch_refuses_signal_while_real_descendant_lives(self):
        prepared = self.prepare('mismatch')
        (self.folder / 'stop').write_text('stop')
        mismatch = read_record(self.folder / 'mismatch.json')
        self.assertTrue(mismatch['refused'])
        self.assertEqual(len(prepared[2]), 2)
        for fd, identity in prepared[2]:
            self.assertFalse(select.select([fd], [], [], 0.05)[0])
        self.assertFalse(select.select([self.sentinel_fd], [], [], 0)[0])
        (self.folder / 'confirm-mismatch').write_text('confirmed')
        result = self.finish(prepared, 'mismatch')
        self.assertTrue(result['mismatch']['refused'])


if __name__ == '__main__':
    if os.getuid() != 1000:
        raise ValueError('expected-non-root-uid1000')
    log = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(LinuxOwnerTests)
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    print(json.dumps({'testCount': tests.testsRun, 'passed': tests.wasSuccessful(),
        'log': log.getvalue(), 'observations': OBSERVATIONS}))
    raise SystemExit(0 if tests.wasSuccessful() else 1)
