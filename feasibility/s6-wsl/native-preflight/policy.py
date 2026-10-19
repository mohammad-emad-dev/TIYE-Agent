"""Policy primitives only: callers must connect every write/wait to enforcement."""
import math
import threading

ALLOCATIONS = {'controller': 524288, 'stream': 131072, 'observer': 262144}
RESERVED = 131072
TOTAL = 1048576
CAPS = {'host-start': 30, 'child-start': 15, 'initialize': 15,
        'eof': 5, 'term': 5, 'kill': 5, 'observe': 15}


class MetadataBudget:
    """Charge gross attempted bytes before I/O; uncertain attempts never refund."""
    def __init__(self):
        self._used = {owner: 0 for owner in ALLOCATIONS}
        self._lock = threading.Lock()

    def charge(self, owner, size):
        if owner not in ALLOCATIONS or type(size) is not int or size < 0:
            raise ValueError('invalid-metadata-charge')
        with self._lock:
            if size > ALLOCATIONS[owner] - self._used[owner]:
                raise ValueError('metadata-allocation-exhausted')
            self._used[owner] += size

    def snapshot(self):
        with self._lock:
            return dict(self._used)


def audit_metadata_sizes(sizes):
    if set(sizes) != set(ALLOCATIONS):
        raise ValueError('exact-metadata-owner-set-required')
    if any(type(size) is not int or not 0 <= size <= ALLOCATIONS[owner]
           for owner, size in sizes.items()):
        raise ValueError('metadata-final-size-exceeded')
    if sum(sizes.values()) + RESERVED > TOTAL:
        raise ValueError('aggregate-metadata-size-exceeded')


def timestamp(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError('finite-monotonic-timestamp-required')
    return value


class NativeSchedule:
    """One origin; phase entries never restore work time or extend cleanup."""
    def __init__(self, origin):
        self.origin = timestamp(origin)
        self.last = self.origin
        self.phase = None
        self.end = self.origin
        self.cleanup_end = None

    def _now(self, now):
        now = timestamp(now)
        if now < self.last:
            raise ValueError('monotonic-clock-regressed')
        self.last = now
        return now

    def enter(self, phase, now):
        now = self._now(now)
        if phase not in CAPS:
            raise ValueError('unknown-phase')
        if phase in ('host-start', 'child-start', 'initialize'):
            self._work_entry(phase, now)
            cutoff = self.origin + 60
        elif phase == 'eof':
            if self.phase not in ('host-start', 'child-start', 'initialize'):
                raise ValueError('cleanup-must-follow-work')
            self.cleanup_end = min(now + 15, self.origin + 75)
            cutoff = self.cleanup_end
        elif phase in ('term', 'kill'):
            if self.phase != {'term': 'eof', 'kill': 'term'}[phase]:
                raise ValueError('cleanup-order')
            cutoff = self.cleanup_end
        else:
            if self.phase not in ('eof', 'term', 'kill'):
                raise ValueError('observation-must-follow-cleanup')
            cutoff = self.origin + 90
        self.phase = phase
        self.end = min(now + CAPS[phase], cutoff)
        return max(0, self.end - now)

    def _work_entry(self, phase, now):
        previous = {'host-start': None, 'child-start': 'host-start', 'initialize': 'child-start'}[phase]
        if self.phase != previous or self.cleanup_end is not None:
            raise ValueError('work-order-or-work-revoked')
        if self.phase is not None and now > self.end:
            raise TimeoutError('previous-work-phase-expired')

    def remaining(self, now):
        if self.phase is None:
            raise ValueError('phase-not-entered')
        return max(0, self.end - self._now(now))
