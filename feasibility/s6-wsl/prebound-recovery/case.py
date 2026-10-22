"""A pre-enrolled Linux standby survives the targeted observer fault."""
import asyncio
import hashlib
import importlib.util
import os
from pathlib import Path
import queue
import subprocess
import threading

from bindings import composition, cohort


def sealed(name, relative):
    spec = importlib.util.spec_from_file_location(name, composition.SOURCE.parent / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


previous = sealed('prebound_sealed_case', 'scheduled-unknown/case.py')
capture = sealed('prebound_sealed_recovery_capture', 'supervised-broker/case.py')


class RecoveryCase(previous.UnknownCase):
    recovery_pipe = capture.KilledObserverCase.recovery_pipe
    recovery_message = capture.KilledObserverCase.recovery_message

    def __init__(self, mode):
        super().__init__(mode)
        self.recovery, self.recovery_threads = None, []
        self.recovery_messages, self.recovery_errors = queue.Queue(maxsize=3), []
        self.recovery_verified = False

    def recover_after_observer_loss(self):
        if not self.unknown_verified or self.recovery is not None or self.fixture_disposed:
            raise RuntimeError('recovery-requires-original-bound-unknown')
        system = Path(os.environ['SystemRoot'])
        argv = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
            '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-I', '-S', '-B',
            self.linux_root + '/linux_runtime.py', 'recover_unknown', self.linux_root, self.nonce]
        self.recovery = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, creationflags=subprocess.CREATE_NO_WINDOW,
            env={'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32')})
        self.recovery_threads = [threading.Thread(target=self.recovery_pipe,
            args=(name, getattr(self.recovery, name)), daemon=True) for name in ('stdout', 'stderr')]
        for thread in self.recovery_threads:
            thread.start()
        binding = {'observer': self.linux_ready['observerProcess'], 'keeper': self.linux_ready['keeper'],
                   'startup': self.linux_ready['startup'], 'invocation': self.linux_ready['descriptor']['InvocationID']}
        self.recovery_write(cohort.writer.encode(binding) + b'\n')
        ready = self.recovery_message('armed')
        if set(ready) != {'event', 'nonce', 'identity'}:
            raise ValueError('recovery-standby-ready-schema')
        self.successor_identity = ready['identity']
        enrollment_request = cohort.writer.encode({'event': 'enroll-fixed-recovery', 'nonce': self.nonce,
                                                   'identity': self.successor_identity}) + b'\n'
        if self.observer.stdin.write(enrollment_request) != len(enrollment_request):
            raise OSError('recovery-enrollment-short-write')
        self.observer.stdin.flush()
        response = self.message('result')
        self.enrollment = self.validate_enrollment(response, binding)
        self.recovery_write(b'enrolled\n')
        enrolled = self.recovery_message('armed')
        expected_ready = {'event': 'armed', 'nonce': self.nonce, 'stage': 'enrolled',
                          'identity': self.successor_identity, 'earlyReleaseRefused': True}
        if cohort.writer.encode(enrolled) != cohort.writer.encode(expected_ready):
            raise ValueError('recovery-enrollment-not-verified-before-fault')
        self.recovery_write(b'kill\n')
        recovered = self.recovery_message('killed')
        expected = {'event': 'killed', 'nonce': self.nonce, 'observer': binding['observer'],
            'identity': self.successor_identity, 'keeperAlive': True, 'earlyReleaseRefused': True,
            'outcome': 'unknown', 'copyVerified': False,
            'enrollmentSha256': hashlib.sha256(cohort.writer.encode(self.enrollment)).hexdigest(),
            'receiptSha256': self.unknown_report['receiptSha256']}
        if cohort.writer.encode(recovered) != cohort.writer.encode(expected):
            raise ValueError('recovery-loss-witness-binding')
        self.recovered_report, self.recovery_verified = recovered, True
        self.observer.wait(timeout=3)

    def validate_enrollment(self, response, binding):
        expected = {'scope': 'fixed-prebound-unknown-owner', 'nonce': self.nonce,
            'observerIdentity': binding['observer'], 'keeperIdentity': binding['keeper']['identity'],
            'recoveryIdentity': self.successor_identity, 'invocation': binding['invocation'],
            'mountIdentity': binding['startup']['runtimeIdentity'],
            'unknownReceiptSha256': self.unknown_report['receiptSha256'],
            'automaticDeletion': False, 'nativeExecutionAllowed': False}
        if cohort.writer.encode(response) != cohort.writer.encode({
                'event': 'result', 'nonce': self.nonce, 'stage': 'enrolled', 'document': expected}):
            raise ValueError('recovery-enrollment-response-binding')
        return expected

    def recovery_write(self, payload):
        if len(payload) > 4096 or self.recovery.stdin.write(payload) != len(payload):
            raise OSError('recovery-input-bound-or-short-write')
        self.recovery.stdin.flush()

    def dispose_fixed_fixture(self):
        if not self.recovery_verified or self.fixture_disposed:
            raise RuntimeError('recovery-disposal-requires-verified-successor')
        self.recovery_write(b'dispose-fixed-fixture\n')
        disposed = self.recovery_message('result')
        expected = self.recovered_report | {'event': 'result', 'keeperAlive': False, 'fixtureDisposalVerified': True}
        if cohort.writer.encode(disposed) != cohort.writer.encode(expected) or self.recovery.wait(timeout=3) != 0:
            raise ValueError('recovery-disposal-evidence-or-exit')
        for thread in self.linux_threads + self.recovery_threads:
            thread.join(timeout=2)
        if (self.observer_errors or self.recovery_errors
                or any(thread.is_alive() for thread in self.linux_threads + self.recovery_threads)):
            raise ValueError('recovery-capture-unsettled')
        self.verify_windows_sizes()
        self.fixture_disposed = True

    def close_settled(self):
        if self.recovery is not None:
            if not self.fixture_disposed or self.recovery.poll() is None:
                raise RuntimeError('recovery-holder-unsettled-retain-handles')
            for name in ('stdin', 'stdout', 'stderr'):
                getattr(self.recovery, name).close()
        super().close_settled()


class RecoveryRun(previous.UnknownRun):
    def prepare(self):
        self.case = RecoveryCase(self.mode)
        self.case.prepare_linux()

    def summary(self):
        selected = super().summary()
        recovered = self.case is not None and self.case.recovery_verified
        if recovered and not self.case.fixture_disposed:
            selected['keeperOwnership'] = 'recovered-held'
        return selected | {'recoveryVerified': recovered, 'observerLossVerified': recovered}

    async def recover_after_observer_loss(self):
        if self.coordinator.pending or self.witness is None or self.coordinator.summary()['outcome'] != 'unknown':
            raise RuntimeError('recovery-before-settled-unknown')
        await asyncio.to_thread(self.case.recover_after_observer_loss)
