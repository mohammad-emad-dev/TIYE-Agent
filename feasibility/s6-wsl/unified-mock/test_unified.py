"""End-to-end mock wire bytes and independently observed Windows/Linux cleanup."""
import base64
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

FILES = ('service.py', 'common.py', 'profile.py', 'worker.py', 'protocol_peer.py', 'lease.py', 'bridge.py', 'entry.py', 'observer.py')
OBSERVATIONS = []
DESTINATION = None
BOOTSTRAP = '''import base64,hashlib,json,os,platform,sys,tempfile
from pathlib import Path
if os.getuid()!=1000: raise ValueError('requires-uid1000')
packet=sys.stdin.buffer.readline(65537)
if len(packet)>65536 or not packet.endswith(b'\\n'): raise ValueError('bundle-budget')
bundle=json.loads(packet)
if set(bundle['files'])!={'bridge.py', 'service.py', 'profile.py', 'worker.py', 'common.py', 'protocol_peer.py', 'entry.py', 'observer.py', 'lease.py'}: raise ValueError('bundle-files')
os.umask(0o077)
root=Path(tempfile.mkdtemp(prefix='tiye-unified-mock-',dir='/tmp'))
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
        return observer, watchdog, identities

    def exercise(self, mode):
        observer, watchdog, identities = self.prepare(mode)
        self.assertTrue(all(not windows.signaled(handle) for handle in self.handles))
        observer.stdin.write(b'release\n')
        observer.stdin.flush()
        linux = self.message('result')
        observer.stdin.close()
        self.assertEqual(observer.wait(timeout=20), 0)
        self.diagnostic.close()
        self.assertEqual((self.root / 'observer.stderr.bin').read_bytes(), b'')
        self.assertEqual(watchdog.wait(timeout=20), 0)
        self.watchdog_log.close()
        for name in ('lease.stderr.bin', 'watchdog.stderr.bin'):
            self.assertEqual((self.root / name).read_bytes(), b'')
        self.assertTrue(all(windows.signaled(handle, 1000) for handle in self.handles))
        report = read_json(self.root / 'watchdog-report.json')
        self.assertTrue(report['windowsJobEmpty'])
        self.assertTrue(report['rootHandleSignaled'])
        self.assertEqual(report['stopReason'], 'job-empty')
        self.assertEqual(report['finalRootExitCode'], 0)
        self.assertEqual(report['deadlineSeconds'], profile.WINDOWS_WATCHDOG_SECONDS)
        result = read_json(self.root / 'protocol-result.json')
        status = result['report']
        self.assertTrue(status['directChildReaped'])
        self.assertEqual(status['returnCode'], 0)
        self.assertEqual(status['readerEof'], {'stdout': True, 'stderr': True})
        self.assertEqual(status['cleanupErrors'], [])
        self.assertEqual(status['signals'], [])
        self.assertFalse(status['spawnUncertain'])
        self.assertEqual(result['heartbeatErrors'], [])
        self.assertEqual(result['leaseExitCode'], 0)
        expected_fault = {'valid': None, 'foreign': 'uncorrelated-or-error-response',
            'invalid-raw': 'invalid-json:UnicodeDecodeError'}[mode]
        self.assertEqual(status['fault'], expected_fault)
        self.assertEqual(result['handshakeFault'], expected_fault)
        self.assertIs(result['handshakeAccepted'], mode == 'valid')
        self.assertEqual(len(status['writes']), 2 if mode == 'valid' else 1)
        self.assertTrue(all(write['state'] == 'locally-drained' for write in status['writes']))
        for stream in ('stdout', 'stderr'):
            raw = (self.root / ('protocol-' + stream + '.bin')).read_bytes()
            self.assertEqual(raw, base64.b64decode(result['rawBase64'][stream], validate=True))
        stderr = (self.root / 'protocol-stderr.bin').read_bytes()
        self.assertEqual(stderr, b'initialized-notification-observed\n' if mode == 'valid' else b'')
        stdout = (self.root / 'protocol-stdout.bin').read_bytes()
        if mode == 'invalid-raw':
            self.assertEqual(stdout, b'\xff\n')
        else:
            packet = json.loads(stdout)
            self.assertEqual(packet['id'], 1 if mode == 'valid' else 2)
            self.assertEqual(packet['result']['codexHome'], '/fixture')
        OBSERVATIONS.append({'case': mode, 'linux': linux, 'protocol': result,
            'windowsIdentities': identities, 'windowsHeldHandlesSignaled': True,
            'watchdog': report, 'runtime': self.runtime, 'bundleSha256': self.bundle_digest})

    def test_valid_protocol_crosses_windows_wsl_service_and_returns_receipt(self):
        self.exercise('valid')

    def test_foreign_response_suppresses_notification_through_real_forwarding(self):
        self.exercise('foreign')

    def test_invalid_utf8_bytes_are_retained_and_refused_through_real_forwarding(self):
        self.exercise('invalid-raw')

    def test_native_execution_flag_is_refused_before_launch(self):
        process = subprocess.run([sys.executable, '-I', '-S', '-B', str(SOURCE / 'run.py'), '--native'],
            capture_output=True, timeout=5)
        self.assertEqual(process.returncode, 2)
        self.assertIn(b'native-execution-disabled: fixed mock launcher only', process.stderr)
        OBSERVATIONS.append({'case': 'native-refusal', 'returnCode': process.returncode,
            'stdoutBase64': base64.b64encode(process.stdout).decode('ascii'),
            'stderrBase64': base64.b64encode(process.stderr).decode('ascii'), 'nativeLaunched': False})

