"""Async phase driver around real blocking fixture adapters, with retained ownership."""
import asyncio
import time

from bindings import deadlines
from adapter import LiveCase


class ScheduledRun:
    def __init__(self, mode):
        self.mode = mode
        self.coordinator = deadlines.Coordinator()
        self.case = None
        self.events = []
        self.witness = None
        self.launch_returned = asyncio.Event()
        self.launch_ack = asyncio.Event()

    def prepare(self):
        self.case = LiveCase(self.mode)
        self.case.prepare_linux()

    async def launch(self):
        await asyncio.to_thread(self.case.launch)
        self.launch_returned.set()
        # Harness may withhold acknowledgment to exercise unknown spawn outcome.
        await self.launch_ack.wait()

    async def step(self, phase, operation):
        self.coordinator.enter(phase)
        started, cutoff = time.monotonic(), self.coordinator.schedule.end
        completed, returned = await self.coordinator.perform(operation)
        ended = time.monotonic()
        self.events.append({'phase': phase, 'startSeconds': started - self.coordinator.schedule.origin,
                            'endSeconds': ended - self.coordinator.schedule.origin,
                            'cutoffSeconds': cutoff - self.coordinator.schedule.origin,
                            'completedWithinPhase': completed})
        return completed, returned

    async def execute(self):
        try:
            plan = [('host-start', lambda: asyncio.to_thread(self.prepare)),
                    ('child-start', self.launch),
                    ('initialize', lambda: asyncio.to_thread(self.case.ready)),
                    ('eof', lambda: asyncio.to_thread(self.case.inject)),
                    ('observe', lambda: asyncio.to_thread(self.case.observe))]
            for phase, operation in plan:
                complete, returned = await self.step(phase, operation)
                if not complete:
                    return self.summary()
                if phase == 'observe':
                    self.witness = returned
                    if time.monotonic() >= self.coordinator.schedule.cleanup_end:
                        self.coordinator.unknown('cleanup-confirmed-after-shared-cutoff')
                    else:
                        self.coordinator.accept_cleanup(returned)
            return self.summary()
        except asyncio.CancelledError:
            # Cancellation is an explicit unknown result; no resource teardown.
            self.coordinator.unknown('caller-cancelled-adapter')
            return self.summary()
        except (OSError, ValueError, RuntimeError, TimeoutError):
            self.coordinator.unknown('adapter-failed')
            raise

    def summary(self):
        status = self.coordinator.summary()
        return {'mode': self.mode, 'scope': 'synthetic-scheduled-windows-ubuntu-adapters',
                'outcome': status['outcome'], 'cleanupVerified': status['cleanupVerified'],
                'unsettledOperations': status['unsettledOperations'],
                'cleanupCutoffSeconds': (self.coordinator.schedule.cleanup_end - self.coordinator.schedule.origin
                                         if self.coordinator.schedule.cleanup_end is not None else None),
                'automaticRetryAllowed': False, 'nativeExecutionAllowed': False,
                'phases': list(self.events)}

    async def settle_for_harness_teardown(self):
        """Outside the credited schedule, never converts unknown to success.

        No cancellation of pending adapter tasks. Failure leaves the run and its
        event loop owned by the harness; it must not call asyncio.run teardown.
        """
        if self.coordinator.pending:
            _, pending = await asyncio.wait(self.coordinator.pending, timeout=25)
            if pending:
                raise RuntimeError('unsettled-adapter-retain-loop-and-handles')
        self.coordinator.reap_settled()
        if self.case is not None and not self.case.closed:
            await asyncio.to_thread(self.case.close_settled)
