"""Four source-bound managed mock cases with independent cross-OS witnesses."""
import base64
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import unittest
import uuid

import composition
sys.path[:0] = [str(composition.LEGACY), str(composition.SOURCE.parent / 'private-capture-store')]
import test_unified as legacy
import validation
import store
import winacl
import audit

RESULTS = []
PRIVATE = []
MODES = {'valid': 'valid', 'stop-pending': 'stop-pending', 'owner-loss': 'owner-loss',
         'stderr-overflow': 'transport-loss'}


class IntegratedTests(legacy.UnifiedTests):
    def setUp(self):
        self.storage = store.create_store()
        self.addCleanup(self.storage.close)
        self.outer = self.storage.new_run(uuid.uuid4().hex)
        self.root = self.outer.path
        self.nonce = uuid.uuid4().hex
        self.processes, self.handles, self.raw = [], [], []
        self.reader = self.diagnostic = self.watchdog_log = None
        self.messages = queue.Queue()

    def bundle(self, mode):
        files = {name: (composition.SOURCE if name == 'protocol_peer.py' else composition.LEGACY) / name
                 for name in legacy.FILES}
        self.bundle_sources = {name: composition.sha(path) for name, path in files.items()}
        bundle = {'nonce': self.nonce, 'mode': mode,
                  'files': {name: base64.b64encode(path.read_bytes()).decode('ascii') for name, path in files.items()},
                  'sha256': self.bundle_sources}
        payload = json.dumps(bundle).encode('ascii') + b'\n'
        self.assertLessEqual(len(payload), 65536)
        self.bundle_digest = hashlib.sha256(payload).hexdigest()
        return payload

    def tearDown(self):
        super().tearDown()
        if not (self.root / 'private-evidence.json').exists():
            return
        audit.directory(self.root, self.storage.owner)
        names = {'retention.json', 'attempt.json', 'host-config.json', 'watchdog-config.json',
                 'host-ready.json', 'watchdog-ready.json', 'watchdog-report.json',
                 'observer.stdout.bin', 'observer.stderr.bin', 'watchdog.stderr.bin',
                 'lease.stderr.bin', 'writer-intent.json', 'private-evidence.json'}
        if self.scenario != 'owner-loss':
            names |= {'protocol-result.json', 'protocol-stdout.bin', 'protocol-stderr.bin', 'writer-result.json'}
        if self.scenario == 'stop-pending':
            names |= {'stop-request.json', 'stop-response.bin', 'stop-result.json'}
        self.assertEqual({p.name for p in self.root.iterdir()}, names)
        observations = {name: audit.file(self.root / name, self.storage.owner, 8388608) for name in names}
        self.assertLessEqual(sum(row['bytes'] for row in observations.values()), 33554432)
        (self.root / 'storage-audit.json').write_text(json.dumps({'files': observations, 'selfExcluded': True}), encoding='utf-8')

    def prepare(self, mode):
        payload = self.bundle(mode)
        system = Path(os.environ['SystemRoot'])
        self.env = {'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32'),
                    'TEMP': str(self.root), 'TMP': str(self.root)}
        argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
                '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
                '/usr/bin/python3', '-I', '-S', '-B', '-c', legacy.BOOTSTRAP]
        self.diagnostic = (self.root / 'observer.stderr.bin').open('xb')
        observer = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=self.diagnostic, env=self.env, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(observer)
        self.reader = threading.Thread(target=legacy.pump, args=(observer.stdout, self.messages, self.raw), daemon=True)
        self.reader.start()
        observer.stdin.write(payload)
        observer.stdin.flush()
        self.runtime = self.message('prepared')
        self.start_host(mode)
        identities = legacy.read_json(self.root / 'host-ready.json')
        ready = legacy.read_json(self.root / 'watchdog-ready.json')
        self.assertEqual(ready, {'nonce': self.nonce, 'pid': identities['root']['pid']})
        for role in ('root', 'lease', 'protocol'):
            self.handles.append(legacy.windows.hold(identities[role], self.nonce))
        self.message('ready')
        self.observer_ready = time.monotonic()
        self.pressure = None
        return observer, self.processes[-1], identities

    def start_host(self, mode):
        sources = composition.sources()
        self.fingerprint = composition.fingerprint(sources)
        config = {'linuxRoot': self.runtime['linuxRoot'], 'windowsRoot': str(self.root),
                  'nonce': self.nonce, 'mode': mode, 'scenario': self.scenario,
                  'sourceSha256': sources, 'composition': self.fingerprint,
                  'captureParent': os.environ['LOCALAPPDATA']}
        (self.root / 'host-config.json').write_text(json.dumps(config), encoding='utf-8')
        self.config_digest = composition.config_digest(config)
        command = [sys.executable, '-I', '-S', '-B', str(composition.SOURCE / 'host.py'), str(self.root / 'host-config.json')]
        watchdog = {'argv': command, 'cwd': str(self.root), 'nonce': self.nonce,
                    'seconds': legacy.profile.WINDOWS_WATCHDOG_SECONDS,
                    'ready': str(self.root / 'watchdog-ready.json'), 'report': str(self.root / 'watchdog-report.json')}
        (self.root / 'watchdog-config.json').write_text(json.dumps(watchdog), encoding='utf-8')
        self.watchdog_log = (self.root / 'watchdog.stderr.bin').open('xb')
        child = subprocess.Popen([sys.executable, '-I', '-S', '-B', str(composition.LEGACY / 'watchdog.py'),
            str(self.root / 'watchdog-config.json')], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=self.watchdog_log, env=self.env, creationflags=subprocess.CREATE_NO_WINDOW)
        self.processes.append(child)

    def inject(self):
        if self.scenario == 'stop-pending':
            path = self.root / 'stop-request.tmp'
            path.write_text(json.dumps({'nonce': self.nonce, 'action': 'stop'}), encoding='utf-8')
            path.replace(self.root / 'stop-request.json')
        elif self.scenario == 'owner-loss':
            legacy.windows.kill(self.handles[0])
        elif self.scenario == 'stderr-overflow':
            script = "from pathlib import Path;import sys; p=Path(sys.argv[1]); f=p/'emit-overflow'; f.open('x').write(sys.argv[2])"
            command = [str(Path(os.environ['SystemRoot']) / 'System32/wsl.exe'), '-d', 'Ubuntu',
                       '--exec', '/usr/bin/python3', '-I', '-S', '-B', '-c', script, self.runtime['linuxRoot'], self.nonce]
            control = subprocess.run(command, capture_output=True, timeout=5, env=self.env,
                                     creationflags=subprocess.CREATE_NO_WINDOW)
            self.assertEqual((control.returncode, control.stdout, control.stderr), (0, b'', b''))

    def exercise(self, mode):
        observer, watchdog, identities = self.prepare(mode)
        self.assertTrue(all(not legacy.windows.signaled(handle) for handle in self.handles))
        original_attempt = (self.root / 'attempt.json').read_bytes()
        intent = legacy.read_json(self.root / 'writer-intent.json')
        self.binding = {'nonce': self.nonce, 'composition': self.fingerprint, 'configSha256': self.config_digest}
        composition.validate_result(intent, self.binding)
        self.assertEqual(intent['nonce'], self.nonce)
        self.assertEqual(intent['composition'], self.fingerprint)
        self.assertEqual(intent['configSha256'], self.config_digest)
        self.assertEqual(intent['sourceSha256'], composition.sources())
        self.assertEqual(intent['beforeSpawn'], {'protectedBeforeFeed': True, 'rawFilesEmpty': True})
        self.injection_started = time.monotonic()
        self.assertLessEqual(self.observer_ready, self.injection_started)
        self.inject()
        injected = time.monotonic()
        observer.stdin.write(b'observe\n')
        observer.stdin.flush()
        linux = self.message('result')
        observer.stdin.close()
        self.assertEqual(observer.wait(timeout=20), 0)
        self.assertEqual(watchdog.wait(timeout=20), 77 if mode == 'owner-loss' else 0)
        self.diagnostic.close()
        self.watchdog_log.close()
        self.assertEqual((self.root / 'observer.stderr.bin').read_bytes(), b'')
        self.assertEqual((self.root / 'watchdog.stderr.bin').read_bytes(), b'')
        self.assertTrue(all(legacy.windows.signaled(handle, 1000) for handle in self.handles))
        protocol = None if mode == 'owner-loss' else legacy.read_json(self.root / 'protocol-result.json')
        record = {'case': mode, 'linux': linux, 'protocol': protocol, 'windowsIdentities': identities,
                  'windowsHeldHandlesSignaled': True, 'windowsHeldHandleCount': len(self.handles),
                  'watchdog': legacy.read_json(self.root / 'watchdog-report.json'), 'runtime': self.runtime,
                  'attempt': json.loads(original_attempt), 'pressure': None,
                  'stop': legacy.read_json(self.root / 'stop-result.json') if mode == 'stop-pending' else None,
                  'injectionToWindowsDoneSeconds': time.monotonic() - injected}
        self.restart(record, original_attempt)
        composition.validate_result(record['watchdog'], {'nonce': self.nonce, 'rootPid': identities['root']['pid']})
        for check in (validation.validate_witnesses, validation.validate_identity,
                      validation.validate_phase, validation.validate_attempt):
            check(record)
        self.capture_result(record, intent)

    def restart(self, record, original_attempt):
        intent_before = (self.root / 'writer-intent.json').read_bytes()
        result = subprocess.run([sys.executable, '-I', '-S', '-B', str(composition.SOURCE / 'host.py'),
            str(self.root / 'host-config.json')], capture_output=True, timeout=5, env=self.env)
        self.assertEqual((result.returncode, result.stdout, result.stderr), (23, b'', b'attempt-already-recorded\n'))
        self.assertEqual((self.root / 'attempt.json').read_bytes(), original_attempt)
        self.assertEqual((self.root / 'writer-intent.json').read_bytes(), intent_before)
        record['restartRefusal'] = {'exitCode': result.returncode, 'journalUnchanged': True,
                                   'stderrBase64': base64.b64encode(result.stderr).decode('ascii')}

    def capture_result(self, record, intent):
        capture = Path(intent['path'])
        completion = capture / 'completion.json'
        if self.scenario == 'owner-loss':
            self.assertIsNone(record['protocol'])
            self.assertFalse((self.root / 'protocol-result.json').exists())
            self.assertFalse((self.root / 'writer-result.json').exists())
            self.assertFalse(completion.exists())
            state = None
        else:
            outcome = legacy.read_json(self.root / 'writer-result.json')
            composition.validate_result(outcome, self.binding)
            self.assertEqual((outcome['nonce'], outcome['composition']), (self.nonce, self.fingerprint))
            self.assertEqual(outcome['configSha256'], self.config_digest)
            state = outcome['state']
            writes = record['protocol']['report']['writes']
            self.assertEqual(writes[0]['payloadSha256'], record['linux']['identities'][2]['initializeBytesSha256'])
            if self.scenario == 'valid':
                self.assertEqual(writes[1]['payloadSha256'], record['linux']['receipt']['initializedBytesSha256'])
            self.verify_protocol(record['protocol'], state, capture)
            self.assertEqual(state['completed'], self.scenario == 'valid')
            self.assertEqual(completion.exists(), self.scenario == 'valid')
        inspected = audit.capture(capture, self.storage.owner, self.scenario == 'valid')
        if self.scenario != 'stop-pending':
            self.assertGreater(inspected['stdout.bin']['bytes'], 0)
        if self.scenario == 'valid':
            manifest = json.loads(completion.read_bytes())
            self.assertEqual(manifest['scope'], 'synchronous-byte-storage-only')
            for name in ('stdout', 'stderr'):
                self.assertEqual(manifest['streams'][name], inspected[name + '.bin'])
        record.update(scenario=self.scenario, composition=self.fingerprint, bundleSourceSha256=self.bundle_sources,
                      writerIntent=intent, writerState=state, streamAudit=inspected,
                      observerReadyMonotonic=self.observer_ready, injectionStartedMonotonic=self.injection_started)
        (self.root / 'private-evidence.json').write_text(json.dumps(record), encoding='utf-8')
        PRIVATE.append(record)
        RESULTS.append({'case': self.scenario, 'cleanupVerified': True, 'restartRefused': True,
                        'privatePrefixRetained': True, 'storageCompleted': self.scenario == 'valid',
                        'ownerFinalResultAbsent': self.scenario == 'owner-loss',
                        'overflowObserved': self.scenario == 'stderr-overflow'})

    def verify_protocol(self, protocol, state, capture):
        report = protocol['report']
        self.assertEqual(protocol['nonce'], self.nonce)
        self.assertTrue(report['rawFieldsSuppressed'])
        self.assertEqual(protocol['rawBase64'], {'stdout': '', 'stderr': ''})
        self.assertTrue(report['directChildReaped'])
        self.assertEqual(report['readerEof'], {'stdout': True, 'stderr': True})
        self.assertEqual(report['cleanupErrors'], [])
        self.assertEqual(report['signals'], [])
        self.assertFalse(report['spawnUncertain'])
        self.assertEqual(protocol['heartbeatErrors'], [])
        self.assertEqual(protocol['leaseExitCode'], 0)
        self.assertEqual(report['returnCode'], 71 if self.scenario == 'stderr-overflow' else 0)
        self.assertEqual(report['fault'], {'valid': None, 'stop-pending': 'normal-stop',
                                        'stderr-overflow': 'capture-stream-overflow'}[self.scenario])
        self.assertEqual(len(report['writes']), 1 if self.scenario == 'stop-pending' else 2)
        self.assertTrue(all(row['state'] == 'locally-drained' for row in report['writes']))
        self.assertTrue(all(row['bufferBytesAfterWrite'] <= row['highWater'] for row in report['writes']))
        self.assertEqual(protocol['handshakeAccepted'], self.scenario != 'stop-pending')
        for name, row in state['streams'].items():
            self.assertEqual(row['seen'], report['observedBytes'][name])
            self.assertEqual(row['retained'], (capture / (name + '.bin')).stat().st_size)
            self.assertEqual(row['seen'], row['retained'] + row['discarded'] + row['uncertain'])
            self.assertEqual(row['uncertain'], 0)
        if self.scenario == 'stderr-overflow':
            self.assertEqual(state['fault'], 'stream-overflow')
            self.assertEqual(state['streams']['stderr']['retained'], 1048576)
            self.assertGreater(state['streams']['stderr']['discarded'], 0)
            self.assertTrue(state['stopRequested'])
            self.assertLessEqual(report['captureFaultObservedMonotonic'], report['workStoppedMonotonic'])
            self.assertLessEqual(report['workStoppedMonotonic'], report['cleanupHookEnteredMonotonic'])
            self.assertLessEqual(report['cleanupHookEnteredMonotonic'], report['cleanupHookReturnedMonotonic'])
        else:
            self.assertIsNone(state['fault'])
            stdout = (capture / 'stdout.bin').read_bytes()
            self.assertEqual(stdout == b'', self.scenario == 'stop-pending')
            if stdout:
                self.assertEqual(json.loads(stdout)['id'], 1)

    def test_valid(self):
        self.scenario = 'valid'
        self.exercise('valid')

    def test_stop(self):
        self.scenario = 'stop-pending'
        self.exercise('stop-pending')

    def test_owner(self):
        self.scenario = 'owner-loss'
        self.exercise('owner-loss')

    def test_overflow(self):
        self.scenario = 'stderr-overflow'
        self.exercise('transport-loss')


def suite():
    return unittest.TestSuite(IntegratedTests(name) for name in ('test_valid', 'test_stop', 'test_owner', 'test_overflow'))
