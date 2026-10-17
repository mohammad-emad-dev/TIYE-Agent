import os
import select
import signal
from pathlib import Path


def identity(pid):
    base = Path('/proc') / str(pid)
    try:
        fields = (base / 'stat').read_text().rsplit(')', 1)[1].split()
        uid = next(row for row in (base / 'status').read_text().splitlines() if row.startswith('Uid:'))
        return {'pid': pid, 'startTicks': int(fields[19]), 'uid': int(uid.split()[1]),
                'boot': Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
    except FileNotFoundError:
        if base.exists():
            raise ValueError('partial-process-identity')
        return None


class OwnedChild:
    def __init__(self):
        self.expected = None
        self.fd = None

    def register(self, pid):
        self.fd = os.pidfd_open(pid)
        self.expected = identity(pid)
        if self.expected is None or self.expected['uid'] != os.getuid():
            raise ValueError('child-identity-unverified')

    def send(self, proc, kind):
        if self.fd is None or self.expected is None or proc.pid != self.expected['pid']:
            raise ValueError('signal-owner-unverified')
        if select.select([self.fd], [], [], 0)[0]:
            return {'kind': kind, 'result': 'already-exited'}
        if identity(proc.pid) != self.expected:
            raise ValueError('signal-identity-mismatch')
        number = signal.SIGTERM if kind == 'term' else signal.SIGKILL
        signal.pidfd_send_signal(self.fd, number)
        return {'kind': kind, 'result': 'sent', 'mechanism': 'pidfd'}


