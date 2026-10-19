"""Protected Windows collector plus an independent WSL pidfd observer."""
import base64
import contextlib
import json
import math
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

import composition
import integration as frozen
from control import reject_constant, unique_members
from resources import BudgetCapture, MetadataFiles, writer
import windows
import linux_runtime

if frozen.composition is not composition or Path(frozen.__file__).resolve() != composition.WATCHDOG / 'integration.py':
    raise RuntimeError('collector-composition-not-bound')

BOOTSTRAP = """import json,sys,base64,hashlib
wire=sys.stdin.buffer.readline(65537)
if len(wire)>65536 or not wire.endswith(b'\\n'): raise ValueError('bundle-cap-or-framing')
p=json.loads(wire); s=base64.b64decode(p['sourceBase64'],validate=True)
if hashlib.sha256(s).hexdigest()!=p['sha256']: raise ValueError('bundle-sha256')
exec(compile(s,'tiye_charged_linux','exec'),{'__name__':'__main__','BUNDLE':p})
"""


class WSLCase(frozen.Collector):
    def __init__(self, mode):
        super().__init__(mode)
        try:
            self.linux_capture = BudgetCapture(self.budget)
            self.resources.callback(self.linux_capture.close)
            self.linux_files = MetadataFiles(self.linux_capture, self.budget)
            self.resources.callback(self.linux_files.close)
        except (OSError, ValueError):
            self.resources.close()
            raise
        self.messages = queue.Queue(maxsize=3)
        self.observer_errors = []
        self.observer = None
        self.linux_threads = []

    def observer_pipe(self, name, pipe):
        pending = bytearray()
        try:
            while payload := pipe.read(16384):
                with self.persist_lock:
                    self.linux_files.write('observer', name + '.bin', payload)
                if name == 'stdout':
                    pending.extend(payload)
                    if len(pending) > 16384:
                        raise ValueError('observer-line-buffer-cap')
                    while b'\n' in pending:
                        line, _, rest = pending.partition(b'\n')
                        pending = bytearray(rest)
                        if len(line) > 8192:
                            raise ValueError('observer-record-cap')
                        record = json.loads(line, object_pairs_hook=unique_members, parse_constant=reject_constant)
                        if (type(record) is not dict or record.get('nonce') != self.nonce
                                or record.get('event') not in ('prepared', 'ready', 'result')):
                            raise ValueError('observer-event-binding')
                        self.messages.put_nowait(record)
            if pending:
                raise ValueError('observer-truncated-record')
        except (OSError, ValueError, queue.Full):
            self.observer_errors.append('observer-capture-or-framing-failure')
            # Continue bounded draining after persistence/framing failure.
            while pipe.read(16384):
                pass

    def message(self, event):
        record = self.messages.get(timeout=12)
        if record['event'] != event or self.observer_errors:
            raise ValueError('observer-event-order-or-capture')
        return record

    def prepare_linux(self):
        system = Path(os.environ['SystemRoot'])
        argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
                '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3',
                '-I', '-S', '-B', '-c', BOOTSTRAP]
        self.observer = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW)
        self.linux_threads = [threading.Thread(target=self.observer_pipe,
            args=(name, getattr(self.observer, name)), daemon=True) for name in ('stdout', 'stderr')]
        for thread in self.linux_threads:
            thread.start()
        source = composition.SOURCE / 'linux_runtime.py'
        packet = writer.encode({'nonce': self.nonce, 'sourceBase64': base64.b64encode(source.read_bytes()).decode(),
                                'sha256': composition.sha(source)}) + b'\n'
        if len(packet) > 65536:
            raise ValueError('source-bundle-cap')
        if self.observer.stdin.write(packet) != len(packet):
            raise OSError('short-bundle-write-no-retry')
        self.observer.stdin.flush()
        prepared = self.message('prepared')
        if prepared['sourceSha256'] != composition.sha(source):
            raise ValueError('linux-source-not-bound')
        self.linux_root = prepared['linuxRoot']

    def launch(self):
        self.files.write('controller', 'attempt.json', writer.encode({'mode': self.mode, 'nonce': self.nonce}))
        config = json.dumps({'windowsRoot': str(self.control_storage.path), 'linuxRoot': self.linux_root})
        argv = [sys.executable, '-I', '-B', str(composition.SOURCE / 'guardian.py'), self.mode,
                config, self.nonce, composition.fingerprint()]
        self.guardian_started = time.monotonic()
        self.guardian = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                         stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW)
        self.threads = [threading.Thread(target=self.drain, args=(name, getattr(self.guardian, name)), daemon=True)
                        for name in ('stdout', 'stderr')]
        for thread in self.threads:
            thread.start()

    def hold_and_inject(self, stack):
        ready = self.wait_ready()
        held = []
        for name in ('root', 'protocol'):
            handle = windows.hold(ready[name], self.nonce)
            stack.callback(windows.close, handle)
            held.append(handle)
        linux_ready = self.message('ready')
        if linux_ready['startup']['nonce'] != self.nonce:
            raise ValueError('linux-ready-binding')
        if self.mode == 'guardian-loss':
            guardian_handle = windows.open_process(self.guardian.pid)
            stack.callback(windows.close, guardian_handle)
            windows.kill(guardian_handle)
        else:
            self.controls.write('release.json', {'action': 'stall' if self.mode == 'stall' else 'exit-owner'})
        if self.observer.stdin.write(b'observe\n') != 8:
            raise OSError('short-observe-command')
        self.observer.stdin.flush()
        return held, linux_ready

    def verify_windows_sizes(self):
        intent = self.controls.read('intent.json')
        worker_sizes = frozen.retained_worker(intent['captureRoot'])
        expected = {'intent.json', 'ready.json'} | ({'release.json'} if self.mode != 'guardian-loss' else set())
        controls = frozen.control_sizes(self.control_storage, expected)
        worker_sizes['controller'] += controls['intent.json'] + controls['ready.json']
        main_sizes, linux_sizes = self.files.audit(), self.linux_files.audit()
        collector_sizes = {owner: main_sizes[owner] + linux_sizes[owner] for owner in main_sizes}
        collector_sizes['controller'] += controls.get('release.json', 0)
        if collector_sizes != self.budget.snapshot():
            raise ValueError('collector-accounting-drift')
        for role, sizes in (('collector', collector_sizes), ('worker', worker_sizes)):
            if any(size > composition.SLICES[role][owner] for owner, size in sizes.items()):
                raise ValueError('windows-final-role-cap')
        composition.policy.audit_metadata_sizes({owner: collector_sizes[owner] + worker_sizes[owner]
                                                 for owner in collector_sizes})

    def execute(self):
        try:
            with contextlib.ExitStack() as stack:
                self.prepare_linux()
                self.launch()
                held, ready = self.hold_and_inject(stack)
                linux = self.message('result')
                linux_result_received = time.monotonic()
                if self.mode == 'stall' and linux_result_received - self.guardian_started >= composition.DEADLINE:
                    raise ValueError('lease-expiry-not-before-windows-deadline')
                report = self.collect_guardian()
                if self.observer.wait(timeout=3) != 0:
                    raise ValueError('observer-exit')
                for thread in self.linux_threads:
                    thread.join(timeout=2)
                if self.observer_errors or any(thread.is_alive() for thread in self.linux_threads):
                    raise ValueError('observer-drain-unsettled')
                if not all(windows.signaled(handle, 2000) for handle in held):
                    raise ValueError('held-windows-process-live')
                self.validate_linux(linux)
                selected = {'mode': self.mode, 'verified': True, 'windowsHeldProcessesSignaled': True,
                    'windowsJobEmpty': report['windowsJobEmpty'] if report else None,
                    'linuxPidfdsSignaled': True, 'linuxCgroupEmpty': True, 'linuxSentinelSurvived': True,
                    'leaseExpiredBeforeWindowsDeadline': True if self.mode == 'stall' else None,
                    'leaseReason': linux['leaseReason'], 'workerEvidenceUncertain': True, 'nativeExecutionAllowed': False}
                self.files.write('controller', 'outcome.json', writer.encode({'selected': selected, 'linux': linux,
                    'linuxReady': ready, 'guardian': report}))
                self.verify_windows_sizes()
                return selected
        finally:
            self.close_observer()
            self.close()

    def validate_linux(self, report):
        fields = {'event', 'nonce', 'heldPidfdsSignaled', 'originalProcEntriesAbsent', 'cgroupEmpty',
                  'sentinelSurvived', 'leaseReason', 'observationSeconds', 'runtimeBytes',
                  'runtimeReservedBytes', 'nativeExecutionAllowed'}
        if set(report) != fields or report['nonce'] != self.nonce or report['event'] != 'result':
            raise ValueError('linux-result-schema')
        for name in ('heldPidfdsSignaled', 'originalProcEntriesAbsent', 'cgroupEmpty', 'sentinelSurvived'):
            if report[name] is not True:
                raise ValueError('linux-witness-unverified')
        if report['leaseReason'] not in ('eof', 'expired') or report['nativeExecutionAllowed'] is not False:
            raise ValueError('linux-lease-or-admission')
        if self.mode == 'stall' and report['leaseReason'] != 'expired':
            raise ValueError('heartbeat-stall-did-not-expire')
        duration = report['observationSeconds']
        if type(duration) not in (int, float) or not math.isfinite(duration) or not 0 <= duration < 8:
            raise ValueError('linux-observation-window')
        sizes = report['runtimeBytes']
        if (type(sizes) is not dict or set(sizes) != set(linux_runtime.CAPS)
                or any(type(size) is not int or not 0 <= size <= linux_runtime.CAPS[role] for role, size in sizes.items())
                or type(report['runtimeReservedBytes']) is not int or report['runtimeReservedBytes'] != linux_runtime.RESERVED
                or sum(sizes.values()) + linux_runtime.RESERVED > 131072):
            raise ValueError('linux-runtime-budget-result')

    def close_observer(self):
        if self.observer is None:
            return
        if self.observer.poll() is None:
            self.observer.stdin.close()
            try:
                self.observer.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.observer.kill()
                self.observer.wait(timeout=3)
        for thread in self.linux_threads:
            thread.join(timeout=2)
        if any(thread.is_alive() for thread in self.linux_threads):
            raise RuntimeError('linux-readers-unsettled-handles-retained')
        for name in ('stdin', 'stdout', 'stderr'):
            getattr(self.observer, name).close()
