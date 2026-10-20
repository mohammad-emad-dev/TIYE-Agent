"""Real Ubuntu filesystem/process fixtures; the native Codex candidate is unused."""
import contextlib
import io
import json
import os
import select
import selectors
import signal
import stat
import subprocess
import unittest

PRIVATE_RUNS = []
RETAINED = []
FIXTURE = r'''
import os,sys
from pathlib import Path
root,target=sys.argv[1:]
base=Path(root)/'codex-home/tmp/arg0'
base.mkdir(parents=True,mode=0o700)
os.chmod(base.parent,0o700)
session=base/'codex-arg0fixture'
session.mkdir(mode=0o700)
for name in ('apply_patch','applypatch','codex-linux-sandbox','codex-execve-wrapper'):
    os.symlink(target,session/name)
fd=os.open(session/'.lock',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
os.close(fd)
os.environ['PATH']='/fixture-mutated-path'
os.write(1,b'ready\n')
if os.read(0,64)!=b'close\n': os._exit(23)
for entry in session.iterdir(): entry.unlink()
session.rmdir()
'''


def proc_start(pid):
    with open('/proc/' + str(pid) + '/stat', 'rb') as stream:
        record = stream.read(4097)
    if len(record) > 4096:
        raise ValueError('proc-stat-bound')
    return record.rsplit(b') ', 1)[1].split()[19]


def bind_live_process(process, expected_executable, pidfd):
    start = proc_start(process.pid)
    executable = os.open('/proc/' + str(process.pid) + '/exe', os.O_RDONLY)
    try:
        actual = os.fstat(executable)
        expected = os.stat(expected_executable, follow_symlinks=False)
        if (not stat.S_ISREG(actual.st_mode) or (actual.st_dev, actual.st_ino) != (expected.st_dev, expected.st_ino)
                or proc_start(process.pid) != start or select.select([pidfd], [], [], 0)[0]):
            raise ValueError('fixture-executable-or-start-identity')
        return {'pidfd': pidfd, 'executable': executable, 'start': start}
    except BaseException:
        os.close(executable)
        raise


def verify_live_process(process, witness):
    current = os.open('/proc/' + str(process.pid) + '/exe', os.O_RDONLY)
    try:
        original, observed = os.fstat(witness['executable']), os.fstat(current)
        if ((original.st_dev, original.st_ino) != (observed.st_dev, observed.st_ino)
                or proc_start(process.pid) != witness['start']
                or select.select([witness['pidfd']], [], [], 0)[0]):
            raise ValueError('held-fixture-identity-changed')
    finally:
        os.close(current)


def launch_environment(process, expected):
    with open('/proc/' + str(process.pid) + '/environ', 'rb') as stream:
        payload = stream.read(8193)
    if len(payload) > 8192 or not payload.endswith(b'\0'):
        raise ValueError('launch-environment-bound')
    pairs = [member.split(b'=', 1) for member in payload[:-1].split(b'\0')]
    if any(len(pair) != 2 for pair in pairs) or len({pair[0] for pair in pairs}) != len(pairs):
        raise ValueError('launch-environment-framing')
    if dict(pairs) != {key.encode(): value.encode() for key, value in expected.items()}:
        raise ValueError('launch-environment-mismatch')


class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.root = OBSERVER['RuntimeRoot']()
        PRIVATE_RUNS.append(str(self.root.path))
        self.retain_root = False
        self.addCleanup(self.close_root)
        self.target = os.path.realpath('/usr/bin/python3')

    def close_root(self):
        if not self.retain_root:
            self.root.close()

    def fixture(self, mode):
        initial = self.root.snapshot(self.target)
        self.assertEqual(initial['helperSessions'], 0)
        environment = self.root.environment()
        child = subprocess.Popen([self.target, '-I', '-S', '-B', '-c', FIXTURE,
            str(self.root.path), self.target], env=environment, cwd=self.root.path,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, close_fds=True, bufsize=0)
        pidfd = os.pidfd_open(child.pid)
        witness = None
        try:
            with selectors.DefaultSelector() as poller:
                poller.register(child.stdout, selectors.EVENT_READ)
                if not poller.select(3) or child.stdout.read(32) != b'ready\n':
                    raise ValueError('fixture-readiness')
            witness = bind_live_process(child, self.target, pidfd)
            launch_environment(child, environment)
            active = self.root.snapshot(self.target)
            verify_live_process(child, witness)
            self.assertEqual(active['helperSessions'], 1)
            self.assertFalse(select.select([pidfd], [], [], 0)[0])
            if mode == 'clean':
                self.assertEqual(child.stdin.write(b'close\n'), 6)
                child.stdin.close()
            else:
                signal.pidfd_send_signal(pidfd, signal.SIGKILL)
            code = child.wait(timeout=3)
            self.assertTrue(select.select([pidfd], [], [], 0)[0])
            final = self.root.snapshot(self.target)
            if mode == 'clean':
                self.assertEqual(code, 0)
                self.assertEqual(final['helperSessions'], 0)
            else:
                self.assertEqual(code, -signal.SIGKILL)
                self.assertEqual(final['helperSessions'], 1)
        finally:
            if child.poll() is None:
                with contextlib.suppress(ProcessLookupError):
                    signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    RETAINED.append((self.root, child, pidfd, witness))
                    self.retain_root = True
                    raise
            if pidfd is not None:
                os.close(pidfd)
            if witness is not None:
                os.close(witness['executable'])
            child.stdin.close()
            child.stdout.close()

    def test_live_fixture_has_before_active_after_snapshots_and_pidfd_exit(self):
        self.fixture('clean')

    def test_interrupted_fixture_retains_aliases_for_unknown_outcome_review(self):
        self.fixture('interrupted')

    def test_dotenv_auth_config_and_unknown_links_are_refused_without_content_read(self):
        for relative in ('codex-home/.env', 'codex-home/auth.json', 'codex-home/config.toml', 'home/.codex'):
            with self.subTest(relative=relative):
                path = self.root.path / relative
                os.symlink('/does-not-exist', path)
                try:
                    with self.assertRaises(ValueError):
                        self.root.snapshot(self.target)
                finally:
                    path.unlink()

    def test_metadata_growth_and_permissions_refuse_snapshot(self):
        retention = self.root.path / 'retention.json'
        with retention.open('ab') as stream:
            stream.write(b'x' * (OBSERVER['FILE_CAP'] + 1))
        with self.assertRaises(ValueError):
            self.root.snapshot(self.target)
        retention.unlink()
        with retention.open('xb') as stream:
            stream.write(b'uncertain')
        os.chmod(retention, 0o644)
        with self.assertRaises(ValueError):
            self.root.snapshot(self.target)


def run_tests():
    log = io.StringIO()
    report = unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromTestCase(ObserverTests))
    if not report.wasSuccessful():
        raise RuntimeError(log.getvalue())
    return {'selected': {'scope': 'synthetic-linux-startup-observer', 'tests': report.testsRun,
        'beforeActiveAfterVerified': True, 'heldPidfdExitVerified': True,
        'interruptedAliasesRetained': True, 'forbiddenInventoryRefused': True,
        'automaticRetryAllowed': False,
        'candidateExecuted': False, 'nativeHelpersObserved': False, 'effectivePathQualified': False,
        'effectiveConfigurationResolved': False, 'nativeExecutionAllowed': False}, 'privateRuns': PRIVATE_RUNS}
