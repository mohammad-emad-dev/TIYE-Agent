"""Linux fixture authority pins; no PID-only or missing-cgroup fallback."""
import ctypes
from dataclasses import dataclass
import os
from pathlib import Path
import select
import socket
import stat
import struct

from prepare import DIRECTORY_FLAGS, open_owned
from request import require

# Same x86-64 Linux UAPI pin as the sealed custody inspector cohort.
SO_PEERPIDFD = 77
CGROUP2_MAGIC = 0x63677270


def signaled(descriptor):
    return bool(select.select([descriptor], [], [], 0)[0])


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    start_ticks: int
    uid: int
    gid: int


def process_identity(pid):
    root = Path('/proc') / str(pid)
    fields = (root / 'stat').read_text().rsplit(')', 1)[1].split()
    status = dict(line.split(':', 1) for line in (root / 'status').read_text().splitlines())
    users = [int(number) for number in status['Uid'].split()]
    groups = [int(number) for number in status['Gid'].split()]
    require(len(set(users)) == len(set(groups)) == 1, 'owner-peer-mixed-credentials')
    return ProcessIdentity(pid, int(fields[19]), users[0], groups[0])


class PeerPin:
    def __init__(self, pid):
        self.identity = process_identity(pid)
        self.descriptor = os.pidfd_open(pid)
        self.closed = False
        try:
            self.live()
        except (OSError, ValueError):
            self.close()
            raise

    def live(self):
        require(not self.closed and not signaled(self.descriptor), 'owner-peer-ended')
        require(process_identity(self.identity.pid) == self.identity
                and not signaled(self.descriptor), 'owner-peer-identity-drift')

    def authenticate(self, peer):
        require(os.uname().machine == 'x86_64', 'owner-socket-pidfd-platform-unqualified')
        self.live()
        expected = (self.identity.pid, self.identity.uid, self.identity.gid)
        require(struct.unpack('3i', peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                == expected, 'owner-wrong-connection-peer')
        peerfd = peer.getsockopt(socket.SOL_SOCKET, SO_PEERPIDFD)
        try:
            os.set_inheritable(peerfd, False)
            rows = (Path('/proc/self/fdinfo') / str(peerfd)).read_text().splitlines()
            require('Pid:\t' + str(self.identity.pid) in rows and not signaled(peerfd),
                    'owner-socket-peer-pidfd-mismatch')
            self.live()
        finally:
            os.close(peerfd)

    def close(self):
        if not self.closed:
            self.closed = True
            os.close(self.descriptor)


def cgroup_filesystem(descriptor):
    filesystem = ctypes.create_string_buffer(256)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.fstatfs.argtypes = (ctypes.c_int, ctypes.c_void_p)
    libc.fstatfs.restype = ctypes.c_int
    require(libc.fstatfs(descriptor, filesystem) == 0
            and ctypes.c_long.from_buffer(filesystem).value == CGROUP2_MAGIC,
            'owner-not-cgroup-v2')


def group_identity(descriptor):
    metadata = os.fstat(descriptor)
    require(stat.S_ISDIR(metadata.st_mode), 'owner-cgroup-not-directory')
    cgroup_filesystem(descriptor)
    return metadata.st_dev, metadata.st_ino


def group_events(descriptor):
    events_fd = os.open('cgroup.events', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
                        dir_fd=descriptor)
    try:
        payload = os.read(events_fd, 1025)
        require(0 < len(payload) <= 1024 and payload.endswith(b'\n'), 'owner-cgroup-events-bound')
    finally:
        os.close(events_fd)
    entries = {}
    for row in payload.decode('ascii').split('\n')[:-1]:
        key, separator, number = row.partition(' ')
        require(separator and key in {'populated', 'frozen'} and key not in entries
                and number in {'0', '1'}, 'owner-cgroup-events-grammar')
        entries[key] = int(number)
    require(set(entries) == {'populated', 'frozen'}, 'owner-cgroup-events-fields')
    return entries


class StoppedWriters:
    def __init__(self, stack, group_fd, worker_pidfds):
        require(type(worker_pidfds) is tuple and 1 <= len(worker_pidfds) <= 8,
                'owner-worker-pin-count')
        self.group = open_owned(stack, group_fd, '.', DIRECTORY_FLAGS)
        self.identity = group_identity(self.group)
        self.workers = []
        for descriptor in worker_pidfds:
            require(os.readlink('/proc/self/fd/' + str(descriptor)) == 'anon_inode:[pidfd]',
                    'owner-worker-descriptor-not-pidfd')
            retained = os.dup(descriptor)
            stack.callback(os.close, retained)
            self.workers.append(retained)

    def verify(self):
        require(group_identity(self.group) == self.identity, 'owner-cgroup-identity-drift')
        require(all(signaled(descriptor) for descriptor in self.workers), 'owner-original-writer-live')
        require(group_events(self.group)['populated'] == 0, 'owner-writer-group-populated')
        require(group_identity(self.group) == self.identity
                and all(signaled(descriptor) for descriptor in self.workers), 'owner-stop-evidence-drift')
