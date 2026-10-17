"""End-to-end mock wire bytes and independently observed Windows/Linux cleanup."""
import base64
import asyncio
import hashlib
import json
import os
import queue
import subprocess
import sys
import threading
import time
import unittest
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))
import windows
import profile
import transport

FILES = ('service.py', 'common.py', 'profile.py', 'worker.py', 'protocol_peer.py', 'lease.py', 'bridge.py', 'entry.py', 'observer.py', 'stop.py')
OBSERVATIONS = []
DESTINATION = None
BOOTSTRAP = '''import base64,hashlib,json,os,platform,sys,tempfile
from pathlib import Path
if os.getuid()!=1000: raise ValueError('requires-uid1000')
packet=sys.stdin.buffer.readline(65537)
if len(packet)>65536 or not packet.endswith(b'\\n'): raise ValueError('bundle-budget')
bundle=json.loads(packet)
if set(bundle['files'])!={'bridge.py', 'service.py', 'profile.py', 'worker.py', 'common.py', 'protocol_peer.py', 'entry.py', 'observer.py', 'lease.py', 'stop.py'}: raise ValueError('bundle-files')
os.umask(0o077)
root=Path(tempfile.mkdtemp(prefix='tiye-unified-write-pressure-',dir='/tmp'))
for name,encoded in bundle['files'].items():
 raw=base64.b64decode(encoded,validate=True)
 if hashlib.sha256(raw).hexdigest()!=bundle['sha256'][name]: raise ValueError('bundle-hash')
 with (root/name).open('xb') as stream: stream.write(raw)
print(json.dumps({'event':'prepared','nonce':bundle['nonce'],'linuxRoot':str(root),
 'uid':os.getuid(),'linux':platform.platform(),'python':platform.python_version()}),flush=True)
sys.path.insert(0,str(root))
import observer
observer.run(root,bundle['nonce'],bundle['mode'])
'''


def read_json(path):
    deadline = time.monotonic() + 7
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    return json.loads(path.read_text(encoding='utf-8'))


def pump(stream, messages, raw):
    while True:
        line = stream.readline(131073)
        if not line:
            messages.put(None)
            return
        raw.append(line)
        messages.put(line)


class UnifiedTests(unittest.TestCase):
    def setUp(self):
        self.nonce = uuid.uuid4().hex
        self.root = DESTINATION / self._testMethodName
        self.root.mkdir()
        self.processes, self.handles, self.raw = [], [], []
        self.reader = self.diagnostic = self.watchdog_log = None
        self.messages = queue.Queue()

    def tearDown(self):
        cleanup_errors = []
        for process in self.processes:
            try:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired) as error:
                cleanup_errors.append('fixture process: ' + repr(error))
        for handle in self.handles:
            try:
                if not windows.signaled(handle):
                    windows.kill(handle)
                if not windows.signaled(handle, 2000):
                    cleanup_errors.append('held Windows process did not exit')
            except OSError as error:
                cleanup_errors.append('held Windows cleanup: ' + repr(error))
            finally:
                try:
                    windows.close(handle)
                except OSError as error:
                    cleanup_errors.append('held Windows close: ' + repr(error))
        if self.reader is not None:
            self.reader.join(timeout=3)
            if self.reader.is_alive():
                cleanup_errors.append('observer output reader still live')
        for diagnostic in (self.diagnostic, self.watchdog_log):
            if diagnostic is not None:
                diagnostic.close()
        for process in self.processes:
            for stream in (process.stdin, process.stdout):
                if stream is not None:
                    stream.close()
        (self.root / 'observer.stdout.bin').write_bytes(b''.join(self.raw))
        self.assertEqual(cleanup_errors, [], 'cleanup errors are reported separately from the original test failure')

    def message(self, event):
        raw = self.messages.get(timeout=8)
        self.assertIsNotNone(raw, 'independent observer exited')
        packet = json.loads(raw)
        self.assertEqual(packet['event'], event)
        self.assertEqual(packet['nonce'], self.nonce)
        return packet

    def prepare(self, mode):
        bundle = {'nonce': self.nonce, 'mode': mode,
            'files': {name: base64.b64encode((SOURCE / name).read_bytes()).decode('ascii') for name in FILES},
            'sha256': {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in FILES}}
        payload = json.dumps(bundle).encode('ascii') + b'\n'
        self.assertLessEqual(len(payload), 65536)
        system = Path(os.environ['SystemRoot'])
        argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
            '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
            '/usr/bin/python3', '-I', '-S', '-B', '-c', BOOTSTRAP]
        env = {'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32'),
            'TEMP': str(self.root), 'TMP': str(self.root)}
        self.diagnostic = (self.root / 'observer.stderr.bin').open('xb')
        observer = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=self.diagnostic, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(observer)
        self.reader = threading.Thread(target=pump, args=(observer.stdout, self.messages, self.raw), daemon=True)
        self.reader.start()
        observer.stdin.write(payload)
        observer.stdin.flush()
        prepared = self.message('prepared')
        self.runtime = prepared
        self.bundle_digest = hashlib.sha256(payload).hexdigest()
        host_config = {'linuxRoot': prepared['linuxRoot'], 'windowsRoot': str(self.root), 'nonce': self.nonce, 'mode': mode}
        (self.root / 'host-config.json').write_text(json.dumps(host_config), encoding='utf-8')
        config = {'argv': [sys.executable, '-I', '-S', '-B', str(SOURCE / 'host.py'), str(self.root / 'host-config.json')],
            'cwd': str(self.root), 'nonce': self.nonce, 'seconds': profile.WINDOWS_WATCHDOG_SECONDS,
            'ready': str(self.root / 'watchdog-ready.json'), 'report': str(self.root / 'watchdog-report.json')}
        (self.root / 'watchdog-config.json').write_text(json.dumps(config), encoding='utf-8')
        self.watchdog_log = (self.root / 'watchdog.stderr.bin').open('xb')
        watchdog = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(SOURCE / 'watchdog.py'),
            str(self.root / 'watchdog-config.json')], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=self.watchdog_log, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(watchdog)
        identities = read_json(self.root / 'host-ready.json')
        watchdog_ready = read_json(self.root / 'watchdog-ready.json')
        self.assertEqual(watchdog_ready, {'nonce': self.nonce, 'pid': identities['root']['pid']})
        for role in ('root', 'lease', 'protocol'):
            self.handles.append(windows.hold(identities[role], self.nonce))
        self.message('ready')
        self.pressure = read_json(self.root / 'pressure-ready.json')
        self.assertEqual(self.pressure['nonce'], self.nonce)
        self.assertTrue(self.pressure['drainStarted'])
        self.assertTrue(self.pressure['drainPending'])
        self.assertEqual(self.pressure['bytes'], profile.PRESSURE_BYTES)
        self.assertEqual(len(self.pressure['samples']), 2)
        self.assertTrue(all(sample['bufferBytes'] > self.pressure['highWater'] for sample in self.pressure['samples']))
        return observer, watchdog, identities

    def exercise(self, mode):
        observer, watchdog, identities = self.prepare(mode)
        self.assertTrue(all(not windows.signaled(handle) for handle in self.handles))
        journal_path = self.root / "attempt.json"
        attempt_before = journal_path.read_bytes()
        attempted = json.loads(attempt_before)
        self.assertEqual(attempted["nonce"], self.nonce)
        self.assertEqual(attempted["state"], "attempted")
        self.assertEqual(attempted["delivery"], "unknown")
        self.assertEqual(attempted['sourceSha256'], hashlib.sha256((SOURCE / 'host.py').read_bytes()).hexdigest())
        self.assertEqual(attempted['pressureWrite'], {'sequence': 3, 'bytes': profile.PRESSURE_BYTES,
            'state': 'attempted', 'delivery': 'unknown'})
        if mode == "pressure-stop":
            request = self.root / "stop-request.tmp"
            request.write_text(json.dumps({"nonce": self.nonce, "action": "stop"}), encoding="utf-8")
            request.replace(self.root / "stop-request.json")
        else:
            windows.kill(self.handles[0 if mode == "pressure-owner-loss" else 2])
        injected = time.monotonic()
        observer.stdin.write(b"observe\n")
        observer.stdin.flush()
        linux = self.message("result")
        observer.stdin.close()
        self.assertEqual(observer.wait(timeout=20), 0)
        self.diagnostic.close()
        self.assertEqual((self.root / "observer.stderr.bin").read_bytes(), b"")
        self.assertEqual(watchdog.wait(timeout=20), 77 if mode == "pressure-owner-loss" else 0)
        self.watchdog_log.close()
        self.assertEqual((self.root / "watchdog.stderr.bin").read_bytes(), b"")
        self.assertTrue(all(windows.signaled(handle, 1000) for handle in self.handles))
        report = read_json(self.root / "watchdog-report.json")
        self.assertTrue(report["windowsJobEmpty"])
        self.assertTrue(report["rootHandleSignaled"])
        self.assertIn(report["stopReason"], ("owner-exit", "job-empty"))
        self.assertEqual(report["finalRootExitCode"], 77 if mode == "pressure-owner-loss" else 0)
        result = None
        if mode != "pressure-owner-loss":
            result = read_json(self.root / "protocol-result.json")
            self.assertIn(result['report']['fault'], {'normal-stop'} if mode == 'pressure-stop' else {'transport-ended', 'write-failed'})
            self.assertTrue(result["report"]["directChildReaped"])
            self.assertEqual(result["report"]["returnCode"], 0 if mode == 'pressure-stop' else 77)
            self.assertEqual(result["heartbeatErrors"], [])
            self.assertEqual(result["leaseExitCode"], 0)
            self.assertEqual(result["report"]["signals"], [])
            self.assertFalse(result["report"]["spawnUncertain"])
            self.assertEqual(len(result['report']['writes']), 3)
            self.assertTrue(all(write['state'] == 'locally-drained' for write in result['report']['writes'][:2]))
            self.assertTrue(all(write['bufferBytesAfterWrite'] <= write['highWater'] for write in result['report']['writes'][:2]))
            self.assertIn(result['report']['writes'][2]['state'], {'uncertain-write', 'uncertain-write-cancelled'})
            self.assertTrue(result['report']['stdinAbortRequested'])
            self.assertEqual({'nonce': self.nonce, **result['report']['pressureWitness']}, self.pressure)
            if mode == 'pressure-stop':
                self.assertEqual(result['report']['writes'][2]['state'], 'uncertain-write-cancelled')
                self.assertLessEqual(result['report']['controlObservedMonotonic'], result['report']['pressureOutcomeMonotonic'])
            for stream in ('stdout', 'stderr'):
                self.assertEqual((self.root / ('protocol-' + stream + '.bin')).read_bytes(),
                    base64.b64decode(result['rawBase64'][stream], validate=True))
        else:
            self.assertFalse((self.root / "protocol-result.json").exists())
        stop = read_json(self.root / "stop-result.json") if mode == "pressure-stop" else None
        restart = subprocess.run([sys.executable, "-I", "-S", "-B", str(SOURCE / "host.py"),
            str(self.root / "host-config.json")], capture_output=True, timeout=5)
        self.assertEqual(restart.returncode, 23)
        self.assertEqual(restart.stdout, b"")
        self.assertEqual(restart.stderr, b"attempt-already-recorded\n")
        self.assertEqual(journal_path.read_bytes(), attempt_before)
        self.assertLess(time.monotonic() - injected, profile.OBSERVATION_SECONDS)
        OBSERVATIONS.append({"case": mode, "linux": linux, "protocol": result,
            "windowsIdentities": identities, "windowsHeldHandlesSignaled": True,
            "watchdog": report, "runtime": self.runtime, "bundleSha256": self.bundle_digest,
            "attempt": attempted, 'pressure': self.pressure, "restartRefusal": {"exitCode": restart.returncode,
                "stderrBase64": base64.b64encode(restart.stderr).decode("ascii"), "journalUnchanged": True},
            "stop": stop, "injectionToWindowsDoneSeconds": time.monotonic() - injected})

    def test_stop_cancels_pending_pressure_write_and_removes_owned_tree(self):
        self.exercise("pressure-stop")

    def test_owner_loss_with_pending_write_expires_lease_and_removes_tree(self):
        self.exercise("pressure-owner-loss")

    def test_transport_loss_marks_write_uncertain_and_removes_tree(self):
        self.exercise("pressure-transport-loss")

    def test_partial_journals_refuse_before_any_launch(self):
        records = []
        for index, raw in enumerate((b"", b"{broken")):
            with self.subTest(raw=raw):
                case_root = self.root / str(index)
                case_root.mkdir()
                (case_root / "attempt.json").write_bytes(raw)
                config = case_root / "host-config.json"
                config.write_text(json.dumps({"mode": "pressure-owner-loss", "windowsRoot": str(case_root), "nonce": self.nonce}))
                child = subprocess.run([sys.executable, "-I", "-S", "-B", str(SOURCE / "host.py"), str(config)],
                    capture_output=True, timeout=5)
                self.assertEqual(child.returncode, 23)
                self.assertEqual(child.stderr, b"attempt-already-recorded\n")
                self.assertEqual((case_root / "attempt.json").read_bytes(), raw)
                self.assertEqual({p.name for p in case_root.iterdir()}, {"attempt.json", "host-config.json"})
                records.append({"bytes": len(raw), "exitCode": child.returncode, "journalUnchanged": True})
        OBSERVATIONS.append({"case": "partial-journal-refusal", "records": records})

    def test_native_execution_flag_is_refused_before_launch(self):
        process = subprocess.run([sys.executable, '-I', '-S', '-B', str(SOURCE / 'run.py'), '--native'],
            capture_output=True, timeout=5)
        self.assertEqual(process.returncode, 2)
        self.assertIn(b'native-execution-disabled: fixed mock launcher only', process.stderr)
        OBSERVATIONS.append({'case': 'native-refusal', 'returnCode': process.returncode,
            'stdoutBase64': base64.b64encode(process.stdout).decode('ascii'),
            'stderrBase64': base64.b64encode(process.stderr).decode('ascii'), 'nativeLaunched': False})

    def test_failed_stop_callback_still_closes_and_reaps_owned_client(self):
        async def broken_stop():
            raise ValueError('injected-stop-callback-failure')

        def cancel_activity():
            raise transport.ProtocolFault('normal-stop')

        def signal_owned(child, kind):
            (child.terminate if kind == 'term' else child.kill)()
            return {'kind': kind, 'result': 'owned-local-regression-child'}

        report, raw = asyncio.run(transport.observe([sys.executable, '-I', '-S', '-B', '-c',
            'import sys; sys.stdout.buffer.write(sys.stdin.buffer.read())'], {
                'env': dict(os.environ), 'cwd': str(self.root), 'seconds': 15, 'spawnSeconds': 5,
                'workSeconds': 2, 'cleanupWaitSeconds': 2,
                'limits': {'stdout': 4096, 'stderr': 4096}, 'initial': b'fixture-input\n',
                'beforeSend': lambda: None, 'beforeCleanup': broken_stop,
                'tick': cancel_activity, 'signal': signal_owned}))
        self.assertEqual(report['fault'], 'normal-stop')
        self.assertEqual(report['cleanupErrors'], ['before-cleanup:ValueError'])
        self.assertTrue(report['directChildReaped'])
        self.assertEqual(report['returnCode'], 0)
        self.assertEqual(report['signals'], [])
        self.assertEqual(report['readerEof'], {'stdout': True, 'stderr': True})
        self.assertEqual(raw, {'stdout': b'fixture-input\n', 'stderr': b''})
        OBSERVATIONS.append({'case': 'cleanup-hook-failure', 'report': report,
            'stdoutBase64': base64.b64encode(raw['stdout']).decode('ascii')})

