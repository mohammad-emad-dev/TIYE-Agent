"""A held refusal is an unknown result, with explicit fixture settlement outside credit."""
import asyncio
import time

from bindings import adapter, cohort, runtime

FIELDS = {'event', 'nonce', 'stage', 'outcome', 'copyVerified', 'automaticDeletion', 'keeperIdentity',
    'mountIdentity', 'invocation', 'receiptSha256', 'keeperAlive', 'workerPidfdsSignaled',
    'originalProcEntriesAbsent', 'cgroupEmpty', 'leaseReason', 'fixtureDisposalVerified', 'nativeExecutionAllowed'}


def validate_refusal(report, ready):
    if type(report) is not dict or set(report) != FIELDS:
        raise ValueError('unknown-result-schema')
    expected = {'event': 'result', 'nonce': ready['startup']['nonce'], 'stage': 'held', 'outcome': 'unknown',
        'copyVerified': False, 'automaticDeletion': False, 'keeperIdentity': ready['keeper']['identity'],
        'mountIdentity': ready['startup']['runtimeIdentity'], 'invocation': ready['descriptor']['InvocationID'],
        'keeperAlive': True, 'workerPidfdsSignaled': True, 'originalProcEntriesAbsent': True, 'cgroupEmpty': True,
        'fixtureDisposalVerified': False, 'nativeExecutionAllowed': False}
    if cohort.writer.encode({key: report[key] for key in expected}) != cohort.writer.encode(expected):
        raise ValueError('unknown-result-binding')
    digest = report['receiptSha256']
    if (type(digest) is not str or len(digest) != 64 or any(char not in '0123456789abcdef' for char in digest)
            or report['leaseReason'] not in ('eof', 'expired')):
        raise ValueError('unknown-result-receipt-or-lease')


class UnknownCase(adapter.LiveCase):
    def __init__(self, mode):
        super().__init__(mode)
        self.unknown_verified, self.fixture_disposed = False, False
        self.unknown_report, self.job_empty = None, None

    def ready(self):
        super().ready()
        expected = {'ownedBeforeProducerAck': True, 'activeBindingsVerified': True}
        if cohort.writer.encode(self.linux_ready['keeperObservation']) != cohort.writer.encode(expected):
            raise ValueError('unknown-keeper-readiness-incomplete')

    def observe(self):
        report = self.message('result')
        validate_refusal(report, self.linux_ready)
        if self.mode == 'stall' and (report['leaseReason'] != 'expired'
                or time.monotonic() - self.guardian_started >= cohort.composition.DEADLINE):
            raise ValueError('unknown-stall-after-fallback-or-not-expired')
        guardian = self.collect_guardian()
        if self.observer.poll() is not None or self.observer_errors:
            raise ValueError('unknown-observer-not-owned')
        if not all(cohort.windows.signaled(handle, 2000) for handle in self.held):
            raise ValueError('unknown-windows-worker-live')
        self.unknown_report, self.unknown_verified = report, True
        self.job_empty = guardian['windowsJobEmpty'] if guardian else None
        selected = self.selected_witness(guardian, report)
        # Process exit evidence alone cannot satisfy the coordinator's cleanup contract.
        selected['verified'], selected['linuxSentinelSurvived'] = False, False
        self.files.write('controller', 'outcome.json', cohort.writer.encode({
            'selected': selected, 'linux': report, 'linuxReady': self.linux_ready, 'guardian': guardian}))
        return selected

    def dispose_fixed_fixture(self):
        if not self.unknown_verified or self.fixture_disposed or self.observer.poll() is not None:
            raise RuntimeError('fixture-disposal-requires-live-bound-unknown')
        payload = b'dispose-fixed-fixture\n'
        if self.observer.stdin.write(payload) != len(payload):
            raise OSError('fixture-disposal-short-write')
        self.observer.stdin.flush()
        disposed = self.message('result')
        expected = self.unknown_report | {'stage': 'fixture-disposed', 'keeperAlive': False,
                                         'fixtureDisposalVerified': True}
        if cohort.writer.encode(disposed) != cohort.writer.encode(expected):
            raise ValueError('fixture-disposal-changed-unknown-evidence')
        if self.observer.wait(timeout=3) != 0:
            raise ValueError('fixture-observer-exit')
        for thread in self.linux_threads:
            thread.join(timeout=2)
        if self.observer_errors or any(thread.is_alive() for thread in self.linux_threads):
            raise ValueError('fixture-observer-drain-unsettled')
        self.verify_windows_sizes()
        self.fixture_disposed = True

    def close_settled(self):
        if self.observer is not None and not self.fixture_disposed:
            raise RuntimeError('unknown-holder-live-retain-observer-and-handles')
        super().close_settled()


class UnknownRun(runtime.ScheduledRun):
    def prepare(self):
        self.case = UnknownCase(self.mode)
        self.case.prepare_linux()

    def summary(self):
        selected = super().summary()
        observed = self.case is not None and self.case.unknown_verified
        disposed = observed and self.case.fixture_disposed
        return selected | {'retentionReceiptVerified': observed, 'retentionOutcome': 'unknown',
            'keeperOwnership': 'disposed-fixed-fixture' if disposed else ('held' if observed else 'unconfirmed'),
            'keeperLiveAtObservation': observed, 'fixtureDisposalVerified': disposed,
            'windowsJobEmpty': self.case.job_empty if observed else None,
            'automaticDeletionAllowed': False, 'candidateExecuted': False, 'nativeAdmissionGranted': False}

    async def dispose_fixed_fixture(self):
        if (self.coordinator.pending or self.witness is None
                or self.coordinator.summary()['outcome'] != 'unknown'):
            raise RuntimeError('fixture-disposal-before-unknown-observation-settled')
        await asyncio.to_thread(self.case.dispose_fixed_fixture)
