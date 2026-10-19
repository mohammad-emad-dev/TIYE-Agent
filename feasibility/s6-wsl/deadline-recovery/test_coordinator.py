"""Policy tests use injected clock boundaries and real asyncio tasks, no OS launch."""
import asyncio
import json
from pathlib import Path
import unittest

from coordinator import Coordinator, cleanup_complete, recovery_disposition

ROOT = Path(__file__).resolve().parents[3]
CASES = json.loads((ROOT / 'output/s6-charged-wsl/observations.json').read_text())['cases']
COMPLETE = next(row for row in CASES if row['mode'] == 'owner-exit')


class Clock:
    def __init__(self):
        self.now = 0

    def __call__(self):
        return self.now


class CoordinatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_work_and_cleanup_share_one_origin_without_reentry(self):
        clock = Clock()
        run = Coordinator(clock)
        for phase, now, expected in [('host-start', 0, 30), ('child-start', 29, 15),
                                     ('initialize', 43, 15), ('eof', 58, 5),
                                     ('term', 63, 5), ('kill', 68, 5), ('observe', 73, 15)]:
            clock.now = now
            self.assertEqual(run.enter(phase), expected)
        with self.assertRaises(RuntimeError):
            run.enter('host-start')
        self.assertEqual(run.schedule.end, 88)
        self.assertFalse(run.summary()['nativeExecutionAllowed'])

    async def test_expiry_before_dispatch_never_invokes_operation(self):
        for now in (30, 31):
            with self.subTest(now=now):
                clock = Clock()
                run = Coordinator(clock)
                run.enter('host-start')
                clock.now = now

                def forbidden():
                    self.fail('expired operation dispatched')

                self.assertEqual(await run.perform(forbidden), (False, None))
                with self.assertRaises(RuntimeError):
                    run.enter('child-start')
                self.assertEqual(run.summary()['outcome'], 'unknown')

    async def test_late_completion_does_not_restore_success_or_retry(self):
        clock = Clock()
        run = Coordinator(clock)
        run.enter('host-start')

        async def late():
            clock.now = 30
            return 'ready'

        self.assertEqual(await run.perform(late), (False, None))
        self.assertEqual(run.reap_settled(), 0)
        run.enter('eof')
        run.enter('observe')
        self.assertTrue(run.accept_cleanup(COMPLETE))
        self.assertTrue(run.summary()['cleanupVerified'])
        self.assertEqual(run.summary()['outcome'], 'unknown')
        self.assertFalse(run.summary()['automaticRetryAllowed'])

    async def test_caller_cancellation_keeps_owned_operation_until_settled(self):
        run = Coordinator(Clock())
        run.enter('host-start')
        entered, release = asyncio.Event(), asyncio.Event()

        async def operation():
            entered.set()
            await release.wait()
            raise OSError('synthetic late failure')

        waiter = asyncio.create_task(run.perform(operation))
        await entered.wait()
        waiter.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await waiter
        self.assertEqual(run.reap_settled(), 1)
        run.enter('eof')
        run.enter('observe')
        self.assertFalse(run.accept_cleanup(COMPLETE))
        release.set()
        await asyncio.sleep(0)
        self.assertEqual(run.reap_settled(), 0)
        self.assertEqual(run.summary()['outcome'], 'unknown')

    async def test_operation_failure_revokes_work_and_cannot_redispatch(self):
        run = Coordinator(Clock())
        run.enter('host-start')

        async def fail():
            raise OSError('synthetic boundary failure')

        with self.assertRaises(OSError):
            await run.perform(fail)
        with self.assertRaises(RuntimeError):
            await run.perform(fail)
        self.assertEqual(run.summary()['outcome'], 'unknown')

    async def test_invalid_phase_preserves_schedule_and_clock_regression_refuses(self):
        clock = Clock()
        run = Coordinator(clock)
        run.enter('host-start')
        clock.now = 1
        with self.assertRaises(ValueError):
            run.enter('initialize')
        self.assertEqual(run.schedule.phase, 'host-start')
        self.assertEqual(run.schedule.last, 0)
        run.enter('child-start')
        clock.now = 0
        with self.assertRaises(ValueError):
            run.enter('initialize')

    async def test_selected_cross_os_witnesses_require_both_group_verdicts(self):
        for row in CASES:
            with self.subTest(mode=row['mode']):
                self.assertEqual(cleanup_complete(row), row['mode'] != 'guardian-loss')
        for field in ('windowsHeldProcessesSignaled', 'windowsJobEmpty',
                      'linuxPidfdsSignaled', 'linuxCgroupEmpty', 'linuxSentinelSurvived'):
            for value in (False, None, 1):
                with self.subTest(field=field, value=value):
                    self.assertFalse(cleanup_complete(dict(COMPLETE, **{field: value})))
        with self.assertRaises(ValueError):
            cleanup_complete(dict(COMPLETE, privatePid=42))

    async def test_recovery_never_infers_relaunch_permission_from_cleanup(self):
        run = Coordinator(Clock())
        run.enter('host-start')
        run.enter('eof')
        run.enter('observe')
        self.assertTrue(run.accept_cleanup(COMPLETE))
        self.assertEqual(run.summary()['outcome'], 'cleanup-observed')
        recovery = recovery_disposition()
        self.assertEqual(recovery['outcome'], 'unknown')
        self.assertTrue(recovery['retainEvidenceAndOwnership'])
        for key in ('automaticRetryAllowed', 'automaticDeletionAllowed',
                    'pidOnlyTerminationAllowed', 'nativeExecutionAllowed'):
            self.assertFalse(recovery[key])

    async def test_wait_timeout_retains_task_without_cancelling_it(self):
        clock = Clock()
        run = Coordinator(clock)
        run.enter('host-start')
        clock.now = 29.99
        release = asyncio.Event()

        async def waiting():
            await release.wait()
            return 'settled later'

        self.assertEqual(await run.perform(waiting), (False, None))
        self.assertEqual(run.reap_settled(), 1)
        self.assertTrue(all(not task.cancelled() for task in run.pending))
        release.set()
        await asyncio.sleep(0)
        self.assertEqual(run.reap_settled(), 0)
        self.assertEqual(run.summary()['outcome'], 'unknown')

    async def test_cleanup_preemption_cannot_extend_inflight_work_deadline(self):
        clock = Clock()
        run = Coordinator(clock)
        run.enter('host-start')

        async def preempted():
            clock.now = 29
            run.enter('eof')
            clock.now = 31
            return 'too late'

        self.assertEqual(await run.perform(preempted), (False, None))
        self.assertEqual(run.reap_settled(), 0)
        self.assertEqual(run.summary()['outcome'], 'unknown')

    async def test_cleanup_and_observation_are_clipped_even_after_delayed_entry(self):
        for eof, cleanup_end in ((50, 65), (70, 75)):
            with self.subTest(eof=eof):
                clock = Clock()
                run = Coordinator(clock)
                run.enter('host-start')
                clock.now = eof
                run.enter('eof')
                self.assertEqual(run.schedule.cleanup_end, cleanup_end)
                clock.now = 75
                self.assertEqual(run.enter('term'), 0)
                self.assertEqual(run.enter('kill'), 0)
                clock.now = 89
                self.assertEqual(run.enter('observe'), 1)
                clock.now = 90
                self.assertFalse(run.accept_cleanup(COMPLETE))

    async def test_timely_operation_returns_value_without_protocol_success_claim(self):
        run = Coordinator(Clock())
        run.enter('host-start')

        async def ready():
            return 'synthetic readiness'

        self.assertEqual(await run.perform(ready), (True, 'synthetic readiness'))
        self.assertEqual(run.summary()['outcome'], 'incomplete')
        self.assertEqual(run.reap_settled(), 0)


if __name__ == '__main__':
    unittest.main()
