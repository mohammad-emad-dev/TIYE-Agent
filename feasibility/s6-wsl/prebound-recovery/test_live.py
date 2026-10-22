"""Actual observer SIGKILL after enrollment never upgrades unknown to cleanup."""
import asyncio
import unittest

from case import RecoveryRun
import linux_runtime

OBSERVATIONS, PRIVATE_RUNS, RETAINED = [], [], []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop, self.session = asyncio.new_event_loop(), None

    def tearDown(self):
        if self.session is not None:
            try:
                if self.session.case.recovery_verified and not self.session.case.fixture_disposed:
                    self.loop.run_until_complete(self.session.dispose_fixed_fixture())
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def execute(self, mode):
        self.session = RecoveryRun(mode)
        self.session.launch_ack.set()
        before = self.loop.run_until_complete(self.session.execute())
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
            'linuxDiagnostics': str(case.linux_capture.storage.path), 'hostControl': str(case.control_storage.path)})
        self.assertEqual(before['keeperOwnership'], 'held')
        self.loop.run_until_complete(self.session.recover_after_observer_loss())
        recovered = self.session.summary()
        self.assertEqual(recovered['keeperOwnership'], 'recovered-held')
        self.assertIsNotNone(case.observer.poll())
        self.assertIsNone(case.recovery.poll())
        with self.assertRaisesRegex(RuntimeError, '^recovery-holder-unsettled-retain-handles$'):
            case.close_settled()
        self.assertIsNone(case.recovery.poll())
        self.loop.run_until_complete(self.session.dispose_fixed_fixture())
        after = self.session.summary()
        for snapshot in (before, recovered, after):
            self.assertEqual(snapshot['outcome'], 'unknown')
            self.assertFalse(snapshot['cleanupVerified'])
            self.assertFalse(snapshot['nativeAdmissionGranted'])
            self.assertFalse(snapshot['automaticRetryAllowed'])
        self.assertEqual(after['keeperOwnership'], 'disposed-fixed-fixture')
        self.assertTrue(after['fixtureDisposalVerified'])
        OBSERVATIONS.append({'observed': before, 'afterObserverLoss': recovered, 'afterExplicitFixtureDisposal': after})

    def test_owner_exit_recovery_preserves_unknown(self):
        self.execute('owner-exit')

    def test_stall_recovery_preserves_unknown(self):
        self.execute('stall')

    def test_guardian_loss_recovery_preserves_unknown(self):
        self.execute('guardian-loss')


class BoundaryTests(unittest.TestCase):
    def test_recovery_before_unknown_observation_is_refused(self):
        loop = asyncio.new_event_loop()
        try:
            with self.assertRaisesRegex(RuntimeError, '^recovery-before-settled-unknown$'):
                loop.run_until_complete(RecoveryRun('owner-exit').recover_after_observer_loss())
        finally:
            loop.close()

    def test_pending_enrollment_cannot_authorize_successor(self):
        state = type('State', (), {'committed': False})()
        with self.assertRaisesRegex(ValueError, '^recovery-original-observer-not-ended$'):
            linux_runtime.NS['successor_authority'](None, None, state)
