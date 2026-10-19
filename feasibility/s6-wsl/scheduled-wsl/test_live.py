"""Real Windows/Ubuntu fixtures; no native provider executable is launched."""
import asyncio
import unittest

from runtime import ScheduledRun

OBSERVATIONS = []
PRIVATE_RUNS = []
RETAINED = []


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        self.session = None

    def tearDown(self):
        if self.session is not None:
            self.session.launch_ack.set()
            try:
                self.loop.run_until_complete(self.session.settle_for_harness_teardown())
            except BaseException:
                RETAINED.append((self.loop, self.session))
                raise
        self.loop.run_until_complete(self.loop.shutdown_default_executor())
        self.loop.close()

    def collect(self, selected):
        case = self.session.case
        PRIVATE_RUNS.append({'collector': str(case.capture.storage.path),
                             'linuxDiagnostics': str(case.linux_capture.storage.path),
                             'hostControl': str(case.control_storage.path)})
        OBSERVATIONS.append(selected)
        self.assertFalse(selected['automaticRetryAllowed'])
        self.assertFalse(selected['nativeExecutionAllowed'])
        return selected

    def execute(self, mode):
        self.session = ScheduledRun(mode)
        self.session.launch_ack.set()
        selected = self.loop.run_until_complete(self.session.execute())
        self.collect(selected)
        self.assertEqual(selected['unsettledOperations'], 0)
        self.assertEqual([row['phase'] for row in selected['phases']],
                         ['host-start', 'child-start', 'initialize', 'eof', 'observe'])
        self.assertTrue(all(row['completedWithinPhase'] for row in selected['phases']))
        return selected

    def test_owner_exit_has_live_cleanup_within_shared_schedule(self):
        selected = self.execute('owner-exit')
        self.assertEqual(selected['outcome'], 'cleanup-observed')
        self.assertTrue(selected['cleanupVerified'])
        self.assertTrue(self.session.witness['windowsJobEmpty'])

    def test_stall_has_lease_expiry_and_live_cleanup_within_schedule(self):
        selected = self.execute('stall')
        self.assertEqual(selected['outcome'], 'cleanup-observed')
        self.assertTrue(selected['cleanupVerified'])
        self.assertTrue(self.session.witness['leaseExpiredBeforeWindowsDeadline'])

    def test_guardian_loss_remains_unknown_without_job_report(self):
        selected = self.execute('guardian-loss')
        self.assertEqual(selected['outcome'], 'unknown')
        self.assertFalse(selected['cleanupVerified'])
        self.assertIsNone(self.session.witness['windowsJobEmpty'])
        self.assertTrue(self.session.witness['linuxCgroupEmpty'])

    def test_cancelled_launch_ack_retains_task_and_never_credits_late_settlement(self):
        self.session = ScheduledRun('owner-exit')

        async def cancel_after_actual_launch():
            execute = asyncio.create_task(self.session.execute())
            await asyncio.wait_for(self.session.launch_returned.wait(), timeout=40)
            execute.cancel()
            return await execute

        selected = self.loop.run_until_complete(cancel_after_actual_launch())
        self.assertIsNotNone(self.session.case.guardian)
        self.assertEqual(self.session.coordinator.schedule.phase, 'child-start')
        self.assertEqual(selected['outcome'], 'unknown')
        self.assertEqual(selected['unsettledOperations'], 1)
        self.assertFalse(self.session.case.closed)
        self.assertFalse(selected['cleanupVerified'])
        self.collect(selected | {'mode': 'spawn-unacknowledged'})
        self.session.launch_ack.set()
        self.loop.run_until_complete(self.session.settle_for_harness_teardown())
        self.assertEqual(self.session.coordinator.reap_settled(), 0)
        self.assertEqual(self.session.summary()['outcome'], 'unknown')
        self.assertFalse(self.session.summary()['cleanupVerified'])
