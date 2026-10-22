"""Shared-schedule adapters for keeper receipt credit and real observer termination."""
import importlib.util
import json
import os
from pathlib import Path
import queue
import subprocess
import threading

from bindings import composition, runtime, cohort

spec = importlib.util.spec_from_file_location('sealed_limited_case', composition.SOURCE.parent / 'limited-observer/case.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)

READY = {'ownedBeforeProducerAck': True, 'activeBindingsVerified': True}


def final_observation(loss):
    return READY | {'keeperExitVerified': True, 'copyReceiptVerified': True, 'observerLossDetected': loss}


class BrokerCase(frozen.LimitedCase):
    observer_fault = 'none'

    def __init__(self, mode):
        super().__init__(mode)
        self.keeper_verified = False

    def ready(self):
        super().ready()
        frozen.verdict(self.linux_ready['keeperObservation'], READY)

    def validate_linux(self, report):
        frozen.verdict(report['keeperObservation'], final_observation(self.observer_fault == 'killed'))
        super().validate_linux({key: value for key, value in report.items() if key != 'keeperObservation'})
        self.keeper_verified = True

    def verify_persistent_copy(self, retention):
        verifier = self.observer if self.observer_fault == 'none' else self.recovery
        if verifier is None or verifier.poll() != 0:
            raise ValueError('keeper-copy-before-verifier-exit')
        system = Path(os.environ['SystemRoot'])
        command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
            '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-I', '-S', '-B',
            self.linux_root + '/linux_runtime.py', 'verify_retained', self.linux_root, self.nonce]
        checked = subprocess.run(command, input=json.dumps(retention).encode() + b'\n', capture_output=True,
            timeout=5, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        for name in ('stdout', 'stderr'):
            payload = getattr(checked, name)
            for offset in range(0, len(payload), cohort.writer.CHUNK):
                self.linux_files.write('observer', name + '.bin', payload[offset:offset + cohort.writer.CHUNK])
        if checked.returncode != 0 or checked.stdout != b'RETAINED-OK\n' or checked.stderr:
            raise ValueError('keeper-copy-after-verifier-exit-unverified')


class KilledObserverCase(BrokerCase):
    observer_fault = 'killed'

    def __init__(self, mode):
        super().__init__(mode)
        self.recovery, self.recovery_threads = None, []
        self.recovery_messages = queue.Queue(maxsize=3)
        self.recovery_errors = []

    def ready(self):
        super().ready()
        system = Path(os.environ['SystemRoot'])
        command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
            '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-I', '-S', '-B',
            self.linux_root + '/linux_runtime.py', 'recover_keeper', self.linux_root, self.nonce]
        self.recovery = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        self.recovery_threads = [threading.Thread(target=self.recovery_pipe,
            args=(name, getattr(self.recovery, name)), daemon=True) for name in ('stdout', 'stderr')]
        for thread in self.recovery_threads:
            thread.start()
        binding = {'observer': self.linux_ready['observerProcess'], 'keeper': self.linux_ready['keeper'],
                   'startup': self.linux_ready['startup'], 'invocation': self.linux_ready['descriptor']['InvocationID']}
        payload = cohort.writer.encode(binding) + b'\n'
        if len(payload) > 4096 or self.recovery.stdin.write(payload) != len(payload):
            raise ValueError('recovery-binding-write-bound')
        self.recovery.stdin.flush()
        armed = self.recovery_message('armed')
        if armed != {'event': 'armed', 'nonce': self.nonce, 'observer': binding['observer'],
                     'keeper': binding['keeper']['identity']}:
            raise ValueError('recovery-held-identities-not-correlated')

    def recovery_pipe(self, name, pipe):
        pending = bytearray()
        try:
            while payload := pipe.read(16384):
                with self.persist_lock:
                    self.linux_files.write('observer', name + '.bin', payload)
                if name != 'stdout':
                    self.recovery_errors.append('unexpected-recovery-stderr')
                    continue
                pending.extend(payload)
                if len(pending) > 8192:
                    raise ValueError('recovery-line-buffer-cap')
                while b'\n' in pending:
                    line, _, rest = pending.partition(b'\n')
                    pending = bytearray(rest)
                    if len(line) > 4096:
                        raise ValueError('recovery-record-cap')
                    record = json.loads(line, object_pairs_hook=cohort.unique_members,
                                        parse_constant=cohort.reject_constant)
                    if (type(record) is not dict or record.get('nonce') != self.nonce
                            or record.get('event') not in ('armed', 'killed', 'result')):
                        raise ValueError('recovery-record-binding')
                    self.recovery_messages.put_nowait(record)
            if pending:
                raise ValueError('recovery-truncated-record')
        except (OSError, ValueError, queue.Full):
            self.recovery_errors.append('recovery-capture-or-framing')
            while pipe.read(16384):
                pass

    def recovery_message(self, expected):
        record = self.recovery_messages.get(timeout=12)
        if record['event'] != expected or self.recovery_errors:
            raise ValueError('recovery-event-order')
        return record

    def inject(self):
        if len(self.held) != 2:
            raise ValueError('observer-fault-before-windows-binding')
        if self.recovery.stdin.write(b'kill\n') != 5:
            raise OSError('recovery-kill-command-short-write')
        self.recovery.stdin.flush()
        killed = self.recovery_message('killed')
        if killed != {'event': 'killed', 'nonce': self.nonce, 'observer': self.linux_ready['observerProcess'],
                      'keeperAlive': True}:
            raise ValueError('recovery-killed-identity-not-correlated')
        self.controls.write('release.json', {'action': 'exit-owner'})
        if self.recovery.stdin.write(b'observe\n') != 8:
            raise OSError('recovery-observe-command-short-write')
        self.recovery.stdin.flush()

    def observe(self):
        linux = self.recovery_message('result')
        guardian = self.collect_guardian()
        if self.recovery.wait(timeout=3) != 0:
            raise ValueError('recovery-process-exit')
        self.observer.wait(timeout=3)
        for thread in self.linux_threads + self.recovery_threads:
            thread.join(timeout=2)
        if (self.observer_errors or self.recovery_errors
                or any(thread.is_alive() for thread in self.linux_threads + self.recovery_threads)):
            raise ValueError('recovery-or-observer-drain-unsettled')
        if not all(cohort.windows.signaled(handle, 2000) for handle in self.held):
            raise ValueError('recovery-windows-process-live')
        self.validate_linux(linux)
        selected = self.selected_witness(guardian, linux)
        self.files.write('controller', 'outcome.json', cohort.writer.encode({
            'selected': selected, 'linux': linux, 'linuxReady': self.linux_ready, 'guardian': guardian}))
        self.verify_windows_sizes()
        self.close_settled()
        return selected

    def close_settled(self):
        if self.recovery is not None:
            if self.recovery.poll() is None:
                self.recovery.stdin.close()
                self.recovery.wait(timeout=15)
            for thread in self.recovery_threads:
                thread.join(timeout=2)
            if any(thread.is_alive() for thread in self.recovery_threads):
                raise RuntimeError('recovery-readers-unsettled-retain-handles')
            for name in ('stdin', 'stdout', 'stderr'):
                getattr(self.recovery, name).close()
        super().close_settled()


class BrokerRun(runtime.ScheduledRun):
    case_type = BrokerCase

    def prepare(self):
        self.case = self.case_type(self.mode)
        self.case.prepare_linux()

    def summary(self):
        selected = super().summary()
        checked = self.case.keeper_verified if self.case else False
        return selected | {'filesystemLimitsVerified': checked, 'retainedSnapshotVerified': checked,
            'keeperVerified': checked, 'initializeResponseVerified': checked,
            'observerFault': self.case.observer_fault if self.case else 'none',
            'initializedPeerReceiptEstablished': False, 'candidateExecuted': False, 'nativeAdmissionGranted': False}


class KilledObserverRun(BrokerRun):
    case_type = KilledObserverCase
