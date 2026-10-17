"""Independent live-before-stop and exit-after-stop witnesses on Ubuntu."""
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
        fields = (Path('/proc') / str(expected['pid']) / 'stat').read_text().rsplit(')', 1)[1].split()
        if int(fields[19]) != expected['startTicks'] or select.select([fd], [], [], 0)[0]:
            raise ValueError('observer-instance-not-live')
    except (OSError, ValueError):
        os.close(fd)
        raise
    return fd, expected


class ActiveStopTests(unittest.TestCase):
    def setUp(self):
        self.folder = SOURCE / ('case-' + uuid.uuid4().hex)
        self.folder.mkdir(mode=0o700)
        self.nonce = uuid.uuid4().hex
        self.processes, self.fds = [], []

    def launch(self, script, mode):
        process = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / script),
            mode, str(self.folder), self.nonce], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
        self.processes.append(process)
        return process

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=3)
        for fd in self.fds:
            os.close(fd)

    def exercise(self, mode):
        sentinel = self.launch('peer.py', 'sentinel')
        sentinel_fd, sentinel_id = hold(self.folder / 'sentinel.json', self.nonce)
        self.fds.append(sentinel_fd)
        supervisor = self.launch('supervisor.py', mode)
        ready = read_record(self.folder / 'ready.json')
        self.assertEqual(ready['nonce'], self.nonce)
        root_fd, root_id = hold(self.folder / 'root.json', self.nonce)
        leaf_fd, leaf_id = hold(self.folder / 'leaf.json', self.nonce)
        self.fds.extend([root_fd, leaf_fd])
        self.assertEqual(leaf_id['ppid'], root_id['pid'])
        self.assertNotEqual(leaf_id['sid'], root_id['sid'])
        self.assertFalse(select.select([root_fd, leaf_fd], [], [], 0)[0])
        (self.folder / 'stop').write_text('stop')
        stdout, stderr = supervisor.communicate(timeout=4)
        self.assertEqual(supervisor.returncode, 0, stderr.decode(errors='replace'))
        self.assertEqual(stdout, b'')
        result = read_record(self.folder / 'result.json')
        self.assertEqual(result['nonce'], self.nonce)
        self.assertIsNone(result['rootBefore']['rootExitCode'])
        self.assertTrue(result['observedEmpty'])
        self.assertEqual(result['after']['liveCount'], 0)
        self.assertLess(result['elapsedSeconds'], 2.1)
        for fd, identity in [(root_fd, root_id), (leaf_fd, leaf_id)]:
            self.assertTrue(select.select([fd], [], [], 0)[0])
            self.assertFalse((Path('/proc') / str(identity['pid'])).exists())
        self.assertFalse(select.select([sentinel_fd], [], [], 0)[0])
        self.assertIsNone(sentinel.poll())
        exits = {row['pid']: row['exitCode'] for row in result['after']['identities']}
        self.assertEqual(set(exits), {root_id['pid'], leaf_id['pid']})
        OBSERVATIONS.append({'case': mode, 'result': result, 'rootIdentity': root_id,
            'leafIdentity': leaf_id, 'sentinelIdentity': sentinel_id,
            'bothObservedLiveBeforeStop': True, 'bothIndependentlyExitedAndReaped': True,
            'unrelatedSentinelLive': True})
        return result, exits[root_id['pid']], exits[leaf_id['pid']]

    def test_active_root_and_adopted_leaf_receive_term_without_kill(self):
        result, root, leaf = self.exercise('graceful')
        self.assertEqual((root, leaf), (-signal.SIGTERM, -signal.SIGTERM))
        self.assertEqual((result['termSignals'], result['killSignals']), (2, 0))

    def test_newly_adopted_term_ignoring_leaf_gets_term_then_kill_once(self):
        result, root, leaf = self.exercise('leaf-stubborn')
        self.assertEqual((root, leaf), (-signal.SIGTERM, -signal.SIGKILL))
        self.assertEqual((result['termSignals'], result['killSignals']), (2, 1))

    def test_killed_stubborn_root_does_not_hide_later_adopted_stubborn_leaf(self):
        result, root, leaf = self.exercise('both-stubborn')
        self.assertEqual((root, leaf), (-signal.SIGKILL, -signal.SIGKILL))
        self.assertEqual((result['termSignals'], result['killSignals']), (1, 2))


if __name__ == '__main__':
    if os.getuid() != 1000:
        raise ValueError('expected-uid1000')
    log = io.StringIO()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(ActiveStopTests))
    print(json.dumps({'testCount': tests.testsRun, 'passed': tests.wasSuccessful(),
        'log': log.getvalue(), 'observations': OBSERVATIONS}))
    raise SystemExit(0 if tests.wasSuccessful() else 1)
