"""Actual Windows schedules preserve unknown custody on bounded protocol faults."""
import asyncio
import unittest

from case import ShutdownCase, ShutdownRun, validate_shutdown, composition

OBSERVATIONS, PRIVATE_RUNS, RETAINED = [], [], []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.session = None

    def tearDown(self):
        if self.session is not None:
            try:
                case = self.session.case
                if case is not None:
                    PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
                        'linuxDiagnostics': str(case.linux_capture.storage.path),
                        'hostControl': str(case.control_storage.path)})
                    if case.unknown_verified and not case.fixture_disposed:
                        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self, mode, fault):
        self.session = ShutdownRun(mode, fault)
        self.session.launch_ack.set()
        observed = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
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

    def test_owner_truncated(self):
        self.assertTrue(self.execute('owner-exit', 'truncated')['windowsJobEmpty'])

    def test_owner_oversize(self):
        self.assertTrue(self.execute('owner-exit', 'oversize')['windowsJobEmpty'])

    def test_stall_wrong_nonce(self):
        self.assertTrue(self.execute('stall', 'wrong-nonce')['windowsJobEmpty'])

    def test_guardian_loss_control(self):
        self.assertIsNone(self.execute('guardian-loss', 'none')['windowsJobEmpty'])

    def test_owner_normal_control(self):
        self.assertTrue(self.execute('owner-exit', 'none')['windowsJobEmpty'])


class BoundaryTests(unittest.TestCase):
    def test_terminal_and_binding_refusals(self):
        ready = {'startup': {'nonce': 'a' * 32, 'runtimeIdentity': [1, 2]},
                 'keeper': {'identity': {'pid': 42}}, 'descriptor': {'InvocationID': 'b' * 32}}
        report = {'event': 'result', 'nonce': 'a' * 32, 'stage': 'held', 'outcome': 'unknown',
            'copyVerified': False, 'automaticDeletion': False, 'keeperIdentity': {'pid': 42},
            'mountIdentity': [1, 2], 'invocation': 'b' * 32, 'receiptSha256': 'c' * 64, 'keeperAlive': True,
            'workerPidfdsSignaled': True, 'originalProcEntriesAbsent': True, 'cgroupEmpty': True,
            'leaseReason': 'fault-truncated', 'terminalSequence': 3,
            'fixtureDisposalVerified': False, 'nativeExecutionAllowed': False}
        validate_shutdown(report, ready, 'truncated')
        for field, value in [('nonce', 'd' * 32), ('keeperIdentity', {'pid': 43}),
                ('mountIdentity', [2, 1]), ('invocation', 'e' * 32), ('keeperAlive', 1),
                ('copyVerified', True), ('nativeExecutionAllowed', True), ('terminalSequence', True),
                ('terminalSequence', 0), ('leaseReason', 'eof'), ('receiptSha256', 'x' * 64)]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    validate_shutdown(report | {field: value}, ready, 'truncated')
        with self.assertRaises(ValueError):
            validate_shutdown(report | {'path': '/tmp/untrusted'}, ready, 'truncated')
        with self.assertRaises(ValueError):
            validate_shutdown(report, ready, 'none')
        case = object.__new__(ShutdownCase)
        case.mode, case.fault, case.nonce = 'owner-exit', 'truncated', 'a' * 32
        guardian = {'mode': case.mode, 'nonce': case.nonce, 'composition': composition.fingerprint(),
            'stopReason': 'job-empty', 'stopDecisionSeconds': 1.0, 'deadlineSeconds': 5,
            'activeProcessesBeforeStop': 0, 'stopRequestReturnedSeconds': 1.001,
            'nativeExecutionAllowed': False, 'windowsJobEmpty': True, 'rootHandleSignaled': True,
            'rootExitCode': 17, 'cleanupObservationSeconds': 0.01, 'postCloseElapsedSeconds': 1.02}
        case.validate_guardian(guardian, 0)
        for field, value in [('activeProcessesBeforeStop', 1), ('rootExitCode', 0),
                ('windowsJobEmpty', 1), ('stopDecisionSeconds', 5),
                ('stopDecisionSeconds', float('nan')), ('nonce', 'b' * 32)]:
            with self.subTest(guardianField=field):
                with self.assertRaises(ValueError):
                    case.validate_guardian(guardian | {field: value}, 0)
        with self.assertRaises(ValueError):
            case.validate_guardian(guardian, 125)

    def test_disposal_requires_bound_unknown_observation(self):
        loop = asyncio.new_event_loop()
        try:
            session = ShutdownRun('owner-exit', 'truncated')
            with self.assertRaisesRegex(RuntimeError, '^fixture-disposal-before-unknown-observation-settled$'):
                loop.run_until_complete(session.dispose_fixed_fixture())
        finally:
            loop.close()
