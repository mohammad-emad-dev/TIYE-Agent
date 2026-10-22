"""Interruption inspection never changes the coordinator's original unknown verdict."""
import asyncio
import importlib.util

from bindings import composition, cohort

spec = importlib.util.spec_from_file_location('interruption_sealed_case', composition.SOURCE.parent / 'scheduled-unknown/case.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
FAULTS = {'owner-exit': 'unobserved-ack', 'stall': 'partial-record', 'guardian-loss': 'standby-loss'}


def validate_interruption(report, ready, original, fault):
    expected_state = ('pending', 'live', False) if fault == 'partial-record' else (
        'committed', 'ended' if fault == 'standby-loss' else 'live', True)
    expected_status = {'event': 'recovery-status', 'nonce': ready['startup']['nonce'], 'stateSource': 'live-keeper',
        'enrollmentState': expected_state[0], 'standbyState': expected_state[1], 'ownerReceiptVerified': expected_state[2],
        'keeperIdentity': ready['keeper']['identity'], 'mountIdentity': ready['startup']['runtimeIdentity'],
        'receiptSha256': original['receiptSha256'], 'outcome': 'unknown', 'automaticReleaseAllowed': False,
        'reEnrollmentAllowed': False, 'nativeExecutionAllowed': False}
    expected = {'event': 'result', 'nonce': ready['startup']['nonce'], 'stage': 'interruption-verified',
        'fault': fault, 'status': expected_status, 'originalReleaseRefused': True, 'reEnrollmentRefused': True}
    if cohort.writer.encode(report) != cohort.writer.encode(expected):
        raise ValueError('interruption-result-binding')


class InterruptionCase(previous.UnknownCase):
    def __init__(self, mode):
        super().__init__(mode)
        self.interruption_verified = False

    def inspect_interruption(self):
        if not self.unknown_verified or self.interruption_verified or self.fixture_disposed:
            raise RuntimeError('interruption-requires-bound-unknown')
        fault = FAULTS[self.mode]
        payload = cohort.writer.encode({'event': 'qualify-interruption', 'nonce': self.nonce, 'fault': fault}) + b'\n'
        if self.observer.stdin.write(payload) != len(payload):
            raise OSError('interruption-command-short-write')
        self.observer.stdin.flush()
        report = self.message('result')
        validate_interruption(report, self.linux_ready, self.unknown_report, fault)
        if self.observer.poll() is not None:
            raise ValueError('interruption-observer-ended')
        self.interruption_report, self.interruption_verified = report, True

    def dispose_fixed_fixture(self):
        if not self.interruption_verified or self.fixture_disposed:
            raise RuntimeError('interruption-teardown-requires-verified-known-fixture')
        payload = b'dispose-interruption-fixture\n'
        if self.observer.stdin.write(payload) != len(payload):
            raise OSError('interruption-teardown-short-write')
        self.observer.stdin.flush()
        disposed = self.message('result')
        expected = self.interruption_report | {'stage': 'fixture-disposed', 'fixtureDisposalVerified': True}
        if cohort.writer.encode(disposed) != cohort.writer.encode(expected) or self.observer.wait(timeout=3) != 0:
            raise ValueError('interruption-teardown-evidence-or-exit')
        for thread in self.linux_threads:
            thread.join(timeout=2)
        if self.observer_errors or any(thread.is_alive() for thread in self.linux_threads):
            raise ValueError('interruption-readers-unsettled')
        self.verify_windows_sizes()
        self.fixture_disposed = True


class InterruptionRun(previous.UnknownRun):
    def prepare(self):
        self.case = InterruptionCase(self.mode)
        self.case.prepare_linux()

    def summary(self):
        selected = super().summary()
        verified = self.case is not None and self.case.interruption_verified
        status = self.case.interruption_report['status'] if verified else {}
        return selected | {'interruptionVerified': verified, 'enrollmentState': status.get('enrollmentState', 'unconfirmed'),
            'standbyState': status.get('standbyState', 'unconfirmed'), 'ownerReceiptVerified': status.get('ownerReceiptVerified', False)}

    async def inspect_interruption(self):
        if self.coordinator.pending or self.witness is None or self.coordinator.summary()['outcome'] != 'unknown':
            raise RuntimeError('interruption-before-settled-unknown')
        await asyncio.to_thread(self.case.inspect_interruption)
