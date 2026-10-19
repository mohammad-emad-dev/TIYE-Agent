"""Bound waits without granting an implicit cancellation grace period."""
import asyncio
import time

from resources import policy


class PhaseClock:
    def __init__(self):
        self.schedule = policy.NativeSchedule(time.monotonic())
        self.events = []

    def enter(self, phase):
        allowance = self.schedule.enter(phase, time.monotonic())
        self.events.append({'phase': phase, 'allowance': allowance})
        return allowance

    async def wait(self, tasks, first=False):
        """Caller retains pending tasks and must account for uncertain spawn/reap."""
        if not tasks:
            return set(), set()
        remaining = self.schedule.remaining(time.monotonic())
        if remaining <= 0:
            return set(), set(tasks)
        return await asyncio.wait(tasks, timeout=remaining,
                                  return_when=asyncio.FIRST_COMPLETED if first else asyncio.ALL_COMPLETED)
