"""Real shared-schedule refusals stay unknown before and after explicit fixture disposal."""
import asyncio
import unittest

from case import UnknownRun, validate_refusal

OBSERVATIONS, PRIVATE_RUNS, RETAINED = [], [], []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.session = None

    def tearDown(self):
        if self.session is not None:
            try:
                case = self.session.case
                if case is not None and case.unknown_verified and not case.fixture_disposed:
                    self.loop.run_until_complete(self.session.dispose_fixed_fixture())
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self, mode):
        self.session = UnknownRun(mode)
        self.session.launch_ack.set()
        observed = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        self.assertEqual(observed['outcome'], 'unknown')
        self.assertFalse(observed['cleanupVerified'])
        self.assertEqual(observed['keeperOwnership'], 'held')
        self.assertIsNone(case.observer.poll())
        with self.assertRaisesRegex(RuntimeError, '^unknown-holder-live-retain-observer-and-handles$'):
            case.close_settled()
        self.assertIsNone(case.observer.poll())
        self.assertFalse(case.closed)
        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
        after = self.session.summary()
        self.assertEqual(after['outcome'], 'unknown')
        self.assertFalse(after['cleanupVerified'])
        self.assertEqual(after['keeperOwnership'], 'disposed-fixed-fixture')
        self.assertTrue(after['fixtureDisposalVerified'])
        self.assertFalse(self.session.coordinator.accept_cleanup(self.session.witness))
        self.assertFalse(self.session.summary()['cleanupVerified'])
        OBSERVATIONS.append({'observed': observed, 'afterExplicitFixtureDisposal': after})
        return observed

    def test_owner_exit_retains_unknown_through_explicit_disposal(self):
        self.assertTrue(self.execute('owner-exit')['windowsJobEmpty'])

    def test_stall_retains_unknown_before_windows_fallback(self):
        self.assertTrue(self.execute('stall')['windowsJobEmpty'])
        self.assertTrue(self.session.witness['leaseExpiredBeforeWindowsDeadline'])

    def test_guardian_loss_keeps_job_empty_unverified(self):
        self.assertIsNone(self.execute('guardian-loss')['windowsJobEmpty'])


class BoundaryTests(unittest.TestCase):
    def test_identity_permission_and_receipt_mismatches_are_refused(self):
        ready = {'startup': {'nonce': 'a' * 32, 'runtimeIdentity': [1, 2]},
                 'keeper': {'identity': {'pid': 42}}, 'descriptor': {'InvocationID': 'b' * 32}}
        report = {'event': 'result', 'nonce': 'a' * 32, 'stage': 'held', 'outcome': 'unknown',
            'copyVerified': False, 'automaticDeletion': False, 'keeperIdentity': {'pid': 42},
            'mountIdentity': [1, 2], 'invocation': 'b' * 32, 'receiptSha256': 'c' * 64, 'keeperAlive': True,
            'workerPidfdsSignaled': True, 'originalProcEntriesAbsent': True, 'cgroupEmpty': True,
            'leaseReason': 'eof', 'fixtureDisposalVerified': False, 'nativeExecutionAllowed': False}
        validate_refusal(report, ready)
        invalid = [('nonce', 'd' * 32), ('keeperIdentity', {'pid': 43}), ('mountIdentity', [2, 1]),
            ('invocation', 'e' * 32), ('keeperAlive', False), ('keeperAlive', 1),
            ('copyVerified', True), ('nativeExecutionAllowed', True), ('fixtureDisposalVerified', True)]
        for field, replacement in invalid:
            with self.subTest(field=field, replacement=replacement):
                with self.assertRaisesRegex(ValueError, '^unknown-result-binding$'):
                    validate_refusal(report | {field: replacement}, ready)
        with self.assertRaisesRegex(ValueError, '^unknown-result-schema$'):
            validate_refusal(report | {'path': '/tmp/untrusted'}, ready)
        for field, replacement in [('receiptSha256', 'x' * 64), ('leaseReason', 'stopped')]:
            with self.assertRaisesRegex(ValueError, '^unknown-result-receipt-or-lease$'):
                validate_refusal(report | {field: replacement}, ready)

    def test_disposal_cannot_be_dispatched_before_a_bound_unknown_result(self):
        loop = asyncio.new_event_loop()
        try:
            session = UnknownRun('owner-exit')
            with self.assertRaisesRegex(RuntimeError, '^fixture-disposal-before-unknown-observation-settled$'):
                loop.run_until_complete(session.dispose_fixed_fixture())
        finally:
            loop.close()
