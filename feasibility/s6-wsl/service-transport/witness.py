"""Independent pidfd/cgroup witnesses for transient user-service cleanup."""
import json
import os
import select
import subprocess
import sys
import time
import unittest
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import service

OBSERVATIONS = []


def read_record(path):
    deadline = time.monotonic() + 2
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    return json.loads(path.read_text())


def hold(path, nonce):
    identity = read_record(path)
    if identity['nonce'] != nonce:
        raise ValueError('observer-nonce-mismatch')
    fd = os.pidfd_open(identity['pid'])
    try:
        fields = (Path('/proc') / str(identity['pid']) / 'stat').read_text().rsplit(')', 1)[1].split()
        if int(fields[19]) != identity['startTicks'] or select.select([fd], [], [], 0)[0]:
            raise ValueError('observer-instance-not-live')
    except (OSError, ValueError):
        os.close(fd)
        raise
    return fd, identity


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.nonce = uuid.uuid4().hex
        self.folder = SOURCE / ('case-' + self.nonce)
        self.folder.mkdir(mode=0o700)
        self.fds = []
        self.descriptor = None
        self.stop_receipt = None
        self.refusal_verified = False
        self.sentinel = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'peer.py'),
            'sentinel', str(self.folder), self.nonce], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'})
        self.sentinel_fd, self.sentinel_id = hold(self.folder / 'sentinel.json', self.nonce)
        self.fds.append(self.sentinel_fd)

    def tearDown(self):
        try:
            if self.descriptor is not None:
                service.stop_owned(self.descriptor)
        finally:
            if self.sentinel.poll() is None:
                self.sentinel.kill()
            self.sentinel.wait(timeout=2)
            for fd in self.fds:
                os.close(fd)

    def prepare(self, seconds=8):
        # The source bundle is retained one level above the per-case marker folder.
        (self.folder / 'peer.py').write_bytes((SOURCE / 'peer.py').read_bytes())
        self.descriptor = service.launch(self.folder, self.nonce, seconds)
        main_fd, main_id = hold(self.folder / 'main.json', self.nonce)
        leaf_fd, leaf_id = hold(self.folder / 'leaf.json', self.nonce)
        self.fds.extend([main_fd, leaf_fd])
        self.assertEqual(main_id['pid'], self.descriptor['mainPid'])
        self.assertEqual(leaf_id['ppid'], main_id['pid'])
        self.assertNotEqual(main_id['sid'], leaf_id['sid'])
        self.assertEqual(main_id['cgroup'], '0::' + self.descriptor['controlGroup'])
        self.assertEqual(leaf_id['cgroup'], main_id['cgroup'])
        self.assertNotEqual(self.sentinel_id['cgroup'], main_id['cgroup'])
        self.assertFalse(select.select([main_fd, leaf_fd], [], [], 0)[0])
        cgroup = Path('/sys/fs/cgroup') / self.descriptor['controlGroup'].lstrip('/')
        self.assertIn('populated 1', (cgroup / 'cgroup.events').read_text())
        return [(main_fd, main_id), (leaf_fd, leaf_id)], cgroup

    def finish(self, mode, owned, cgroup, started):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            exited = all(select.select([fd], [], [], 0)[0] for fd, identity in owned)
            absent = all(not (Path('/proc') / str(identity['pid'])).exists() for fd, identity in owned)
            empty = not cgroup.exists() or 'populated 0' in (cgroup / 'cgroup.events').read_text()
            if exited and absent and empty:
                break
            time.sleep(0.01)
        for fd, identity in owned:
            self.assertTrue(select.select([fd], [], [], 0)[0])
            self.assertFalse((Path('/proc') / str(identity['pid'])).exists())
        group_state = 'removed' if not cgroup.exists() else (cgroup / 'cgroup.events').read_text()
        self.assertTrue(group_state == 'removed' or 'populated 0' in group_state)
        self.assertFalse(select.select([self.sentinel_fd], [], [], 0)[0])
        self.assertIsNone(self.sentinel.poll())
        elapsed = time.monotonic() - started
        self.assertLess(elapsed, 5)
        after = service.query(self.descriptor['unit'])
        if mode == 'main-crash':
            self.assertEqual(after['properties']['Result'], 'signal')
            self.assertEqual(after['properties']['ExecMainStatus'], '9')
        if mode == 'runtime-expiry':
            self.assertEqual(after['properties']['Result'], 'timeout')
        if mode == 'normal-main-exit':
            self.assertEqual(after['properties']['ExecMainStatus'], '0')
            self.assertEqual(after['properties']['ExecMainCode'], '1')
            self.assertEqual(after['properties']['Result'], 'timeout')
        OBSERVATIONS.append({'case': mode, 'descriptor': self.descriptor, 'after': after,
            'identities': [identity for fd, identity in owned], 'cgroupAfter': group_state,
            'elapsedSeconds': elapsed, 'independentPidfdsSignaled': True,
            'originalProcEntriesAbsent': True, 'unrelatedSentinelLive': True,
            'sentinelIdentity': self.sentinel_id, 'stopReceipt': self.stop_receipt,
            'identityRefusalIndependentlyObserved': self.refusal_verified})

