"""Nonexecuting phase coordinator; adapters still require live qualification."""
import asyncio
import copy
import importlib.util
from pathlib import Path
import time


POLICY_PATH = Path(__file__).resolve().parents[1] / 'native-preflight/policy.py'
spec = importlib.util.spec_from_file_location('deadline_recovery_policy', POLICY_PATH)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
WORK = frozenset(('host-start', 'child-start', 'initialize'))


class Coordinator:
    """One event-loop owner; pending tasks/handles must outlive this object.

    Operation factories must return coroutines without blocking. This class
    cannot interrupt synchronous I/O, survive collector loss or enforce OS timers.
    """
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.schedule = policy.NativeSchedule(clock())
        self.pending = set()
        self.dispatched = set()
        self.unknown_reason = None
        self.work_revoked = False
        self.cleanup_verified = False

    def unknown(self, reason):
        if self.unknown_reason is None:
            self.unknown_reason = reason
        self.work_revoked = True

    def enter(self, phase):
        """Invalid transitions do not partially mutate the frozen schedule."""
        now = policy.timestamp(self.clock())
        if phase in WORK:
            if self.work_revoked or self.pending:
                raise RuntimeError('work-revoked-or-unsettled')
            if self.schedule.phase is not None and now >= self.schedule.end:
                self.unknown('work-deadline')
                raise TimeoutError('previous-work-phase-expired')
        candidate = copy.deepcopy(self.schedule)
        allowance = candidate.enter(phase, now)
        if self.schedule.phase in WORK and now >= self.schedule.end:
            self.unknown('work-deadline')
        self.schedule = candidate
        if phase not in WORK:
            self.work_revoked = True
            if self.pending:
                self.unknown('phase-changed-with-unsettled-operation')
        return allowance

    def remaining_until(self, cutoff):
        self.schedule.remaining(self.clock())
        return max(0, cutoff - self.schedule.last)

    async def perform(self, operation):
        """One dispatch per phase; timeout retains task, never adds cancel grace.

        Returns (completed, value). A completed operation is not protocol success
        or cleanup proof. Caller cancellation propagates after marking unknown.
        """
        phase = self.schedule.phase
        if phase is None or phase in self.dispatched:
            raise RuntimeError('phase-missing-or-already-dispatched')
        if phase in WORK and (self.work_revoked or self.pending):
            raise RuntimeError('work-revoked-or-unsettled')
        if self.schedule.remaining(self.clock()) <= 0:
            self.unknown('dispatch-deadline')
            return False, None
        self.dispatched.add(phase)
        cutoff = self.schedule.end
        try:
            task = asyncio.create_task(operation())
            self.pending.add(task)
            allowance = self.remaining_until(cutoff)
            if allowance <= 0:
                self.unknown('dispatch-overrun')
                return False, None
            done, _ = await asyncio.wait({task}, timeout=allowance)
            # A ready task delivered at/after the cutoff cannot earn credit.
            if (not done or self.remaining_until(cutoff) <= 0
                    or self.schedule.phase != phase):
                self.unknown('operation-deadline')
                return False, None
            self.pending.remove(task)
            return True, task.result()
        except BaseException:
            self.unknown('operation-or-caller-failure')
            raise

    def reap_settled(self):
        """Consume exceptions without cancelling or waiting for unsettled tasks."""
        for task in tuple(self.pending):
            if task.done():
                try:
                    task.result()
                except BaseException:
                    self.unknown('late-operation-failure')
                self.pending.remove(task)
        return len(self.pending)

    def accept_cleanup(self, witness):
        """Selected fixture verdicts are compatibility input, not OS attestation."""
        if self.schedule.phase != 'observe':
            raise RuntimeError('cleanup-requires-observation-phase')
        self.reap_settled()
        if self.pending or self.schedule.remaining(self.clock()) <= 0:
            self.unknown('cleanup-unsettled-or-late')
            return False
        if not cleanup_complete(witness):
            self.unknown('cleanup-evidence-incomplete')
            return False
        self.cleanup_verified = True
        return True

    def summary(self):
        return {'scope': 'nonexecuting-deadline-recovery-policy',
                'outcome': 'unknown' if self.unknown_reason else
                           ('cleanup-observed' if self.cleanup_verified else 'incomplete'),
                'cleanupVerified': self.cleanup_verified,
                'unsettledOperations': len(self.pending),
                'automaticRetryAllowed': False, 'nativeExecutionAllowed': False}


def cleanup_complete(row):
    """Conservative mapping from the sealed charged-WSL public case schema.

    Guardian loss has no Job-empty report, so full group cleanup stays unknown
    even when the original held Windows/Linux processes are observed dead.
    """
    fields = {'mode', 'verified', 'windowsHeldProcessesSignaled', 'windowsJobEmpty',
              'linuxPidfdsSignaled', 'linuxCgroupEmpty', 'linuxSentinelSurvived',
              'leaseExpiredBeforeWindowsDeadline', 'leaseReason',
              'workerEvidenceUncertain', 'nativeExecutionAllowed'}
    if type(row) is not dict or set(row) != fields:
        raise ValueError('exact-selected-witness-schema-required')
    if row['mode'] not in ('stall', 'owner-exit', 'guardian-loss'):
        raise ValueError('unknown-witness-mode')
    required = ('verified', 'windowsHeldProcessesSignaled', 'linuxPidfdsSignaled',
                'linuxCgroupEmpty', 'linuxSentinelSurvived', 'workerEvidenceUncertain')
    lease = row['leaseReason'] in ('eof', 'expired')
    if row['mode'] == 'stall':
        lease = row['leaseReason'] == 'expired' and row['leaseExpiredBeforeWindowsDeadline'] is True
    else:
        lease = lease and row['leaseExpiredBeforeWindowsDeadline'] is None
    return (all(row[key] is True for key in required) and lease
            and row['nativeExecutionAllowed'] is False
            and row['mode'] != 'guardian-loss' and row['windowsJobEmpty'] is True)


def recovery_disposition():
    """Restart has no trusted in-memory ownership; no automatic resume/relaunch."""
    return {'outcome': 'unknown', 'automaticRetryAllowed': False,
            'automaticDeletionAllowed': False, 'pidOnlyTerminationAllowed': False,
            'retainEvidenceAndOwnership': True, 'nativeExecutionAllowed': False}
