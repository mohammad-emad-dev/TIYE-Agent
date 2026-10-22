"""Actual interrupted enrollments preserve unknown state and block release."""
import asyncio
import unittest

from case import InterruptionRun, validate_interruption

OBSERVATIONS, PRIVATE_RUNS, RETAINED = [], [], []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop, self.session = asyncio.new_event_loop(), None

    def tearDown(self):
        if self.session is not None:
            case = self.session.case
            if case is not None:
                private = {'collector': str(case.capture.storage.path),
                    'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)}
                if private not in PRIVATE_RUNS:
                    PRIVATE_RUNS.append(private)
            try:
                if self.session.case.interruption_verified and not self.session.case.fixture_disposed:
                    self.loop.run_until_complete(self.session.dispose_fixed_fixture())
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self, mode):
        self.session = InterruptionRun(mode)
        self.session.launch_ack.set()
        before = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        self.loop.run_until_complete(self.session.inspect_interruption())
        inspected = self.session.summary()
        self.assertEqual(before['outcome'], 'unknown')
        self.assertTrue(inspected['interruptionVerified'])
        self.assertEqual(inspected['keeperOwnership'], 'held')
        with self.assertRaisesRegex(RuntimeError, '^unknown-holder-live-retain-observer-and-handles$'):
            case.close_settled()
        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
        after = self.session.summary()
        for snapshot in (inspected, after):
            self.assertEqual(snapshot['outcome'], 'unknown')
            self.assertFalse(snapshot['cleanupVerified'])
            self.assertFalse(snapshot['automaticRetryAllowed'])
            self.assertFalse(snapshot['nativeAdmissionGranted'])
        OBSERVATIONS.append({'afterInterruption': inspected, 'afterExplicitFixtureDisposal': after})
        return inspected

    def test_unobserved_ack_reconciles_committed_without_restoring_release(self):
        self.assertEqual(self.execute('owner-exit')['enrollmentState'], 'committed')

    def test_partial_record_reports_pending_without_claiming_valid_receipt(self):
        self.assertFalse(self.execute('stall')['ownerReceiptVerified'])

    def test_standby_death_is_observed_through_original_pidfd(self):
        self.assertEqual(self.execute('guardian-loss')['standbyState'], 'ended')


class BoundaryTests(unittest.TestCase):
    def test_interruption_before_unknown_observation_is_refused(self):
        loop = asyncio.new_event_loop()
        try:
            with self.assertRaisesRegex(RuntimeError, '^interruption-before-settled-unknown$'):
                loop.run_until_complete(InterruptionRun('owner-exit').inspect_interruption())
        finally:
            loop.close()

    def test_mutated_status_cannot_be_accepted_as_verified_inspection(self):
        ready = {'startup': {'nonce': 'a' * 32, 'runtimeIdentity': [1, 2]}, 'keeper': {'identity': {'pid': 42}}}
        original = {'receiptSha256': 'b' * 64}
        status = {'event': 'recovery-status', 'nonce': 'a' * 32, 'stateSource': 'live-keeper',
            'enrollmentState': 'pending', 'standbyState': 'live', 'ownerReceiptVerified': False,
            'keeperIdentity': {'pid': 42}, 'mountIdentity': [1, 2], 'receiptSha256': 'b' * 64,
            'outcome': 'unknown', 'automaticReleaseAllowed': False, 'reEnrollmentAllowed': False,
            'nativeExecutionAllowed': False}
        report = {'event': 'result', 'nonce': 'a' * 32, 'stage': 'interruption-verified', 'fault': 'partial-record',
            'status': status, 'originalReleaseRefused': True, 'reEnrollmentRefused': True}
        validate_interruption(report, ready, original, 'partial-record')
        for key, replacement in [('ownerReceiptVerified', True), ('automaticReleaseAllowed', True),
            ('reEnrollmentAllowed', True), ('stateSource', 'disk-recovered'), ('standbyState', 'ended'),
            ('keeperIdentity', {'pid': 43}), ('receiptSha256', 'c' * 64)]:
            with self.subTest(key=key):
                with self.assertRaisesRegex(ValueError, '^interruption-result-binding$'):
                    validate_interruption(report | {'status': status | {key: replacement}}, ready, original, 'partial-record')
