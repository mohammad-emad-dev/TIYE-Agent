# owner.py
import ctypes
import hashlib
import os
import select
import signal
import subprocess
import sys
from pathlib import Path
from types import MappingProxyType


def _boot_hash():
    return hashlib.sha256(
        Path("/proc/sys/kernel/random/boot_id").read_bytes().strip()
    ).hexdigest()


class Owner:
    def __init__(self):
        if sys.platform != "linux" or os.getuid() != 1000:
            raise RuntimeError("platform-or-uid")
        if signal.getsignal(signal.SIGCHLD) != signal.SIG_DFL:
            raise RuntimeError("sigchld-disposition")
        self._owner_pid = os.getpid()
        children = Path(
            f"/proc/self/task/{self._owner_pid}/children"
        ).read_text(encoding="ascii").strip()
        if children:
            raise RuntimeError("existing-children")
        if len(list(Path('/proc/self/task').iterdir())) != 1:
            raise RuntimeError('single-threaded-owner-required')

        self._boot_id_sha256 = _boot_hash()
        self._libc = ctypes.CDLL(None, use_errno=True)
        self._prctl = self._libc.prctl
        self._prctl.argtypes = [ctypes.c_int] + [ctypes.c_ulong] * 4
        self._prctl.restype = ctypes.c_int
        if self._prctl(36, 1, 0, 0, 0) != 0:
            err = ctypes.get_errno()
            raise OSError(err, os.strerror(err))
        enabled = ctypes.c_int()
        if self._prctl(37, ctypes.addressof(enabled), 0, 0, 0) != 0:
            err = ctypes.get_errno()
            raise OSError(err, os.strerror(err))
        if enabled.value != 1:
            raise RuntimeError("subreaper-not-enabled")

        self.root_pid = None
        self.records = {}
        self.root = None
        self._started = False

    def _read_identity(self, pid):
        stat = Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
        fields = stat[stat.rfind(")") + 2:].split()
        ppid = int(fields[1])
        start_ticks = int(fields[19])
        status = Path(f"/proc/{pid}/status").read_text(encoding="ascii")
        uid = int(next(line.split()[1] for line in status.splitlines()
                       if line.startswith("Uid:")))
        boot_hash = _boot_hash()
        if (ppid != self._owner_pid or uid != os.getuid()
                or boot_hash != self._boot_id_sha256):
            raise ValueError("identity-mismatch")
        return {
            "pid": pid,
            "startTicks": start_ticks,
            "uid": uid,
            "bootIdSha256": boot_hash,
        }

    def start(self, argv, cwd, env):
        if self._started:
            raise RuntimeError("already-started")
        self._started = True
        self.root = subprocess.Popen(
            argv, cwd=cwd, env=env,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, start_new_session=True,
        )
        self.root_pid = self.root.pid
        self.sweep()
        return self.root_pid

    def sweep(self):
        path = Path(f"/proc/self/task/{self._owner_pid}/children")
        for item in path.read_text(encoding="ascii").split():
            pid = int(item)
            if pid in self.records:
                if self.records[pid]['exitCode'] is not None:
                    raise ValueError('reaped-pid-reappeared')
                continue
            identity = self._read_identity(pid)
            fd = os.pidfd_open(pid, 0)
            kept = False
            try:
                if self._read_identity(pid) != identity:
                    raise ValueError("identity-mismatch")
                self.records[pid] = {
                    "identity": MappingProxyType(identity),
                    "fd": fd,
                    "exitCode": None,
                }
                kept = True
            finally:
                if not kept:
                    os.close(fd)

        for pid, record in self.records.items():
            if record["exitCode"] is not None:
                continue
            waited, status = os.waitpid(pid, os.WNOHANG)
            if waited == pid:
                code = os.waitstatus_to_exitcode(status)
                record["exitCode"] = code
                if pid == self.root_pid:
                    self.root.returncode = code
            elif waited != 0:
                raise RuntimeError("unexpected-waitpid-result")

        return [
            dict(record["identity"])
            for record in self.records.values()
            if record["exitCode"] is None
        ]

    def send(self, number):
        self.sweep()
        verified = []
        for pid, record in self.records.items():
            if record["exitCode"] is None:
                if self._read_identity(pid) != record["identity"]:
                    raise ValueError("identity-mismatch")
                verified.append((pid, record["fd"]))

        ready_fds = {
            fd for fd in (fd for _, fd in verified)
            if select.select([fd], [], [], 0)[0]
        }
        sent = 0
        for pid, fd in verified:
            if fd in ready_fds:
                continue
            try:
                signal.pidfd_send_signal(fd, number)
            except ProcessLookupError:
                continue
            sent += 1
        return sent

    def report(self):
        identities = []
        for record in self.records.values():
            item = dict(record["identity"])
            item["exitCode"] = record["exitCode"]
            identities.append(item)
        root_record = self.records.get(self.root_pid)
        root_code = None if root_record is None else root_record["exitCode"]
        return {
            "rootPid": self.root_pid,
            "rootExitCode": root_code,
            "identities": identities,
            "liveCount": sum(
                record["exitCode"] is None
                for record in self.records.values()
            ),
        }

    def empty(self):
        # Reaping a root can reveal an adoption after sweep's first snapshot.
        children = Path(f'/proc/self/task/{self._owner_pid}/children').read_text(encoding='ascii').strip()
        return self.report()['liveCount'] == 0 and not children

    def close(self):
        errors = []
        for record in self.records.values():
            fd = record["fd"]
            if fd is not None:
                try:
                    os.close(fd)
                except OSError as exc:
                    errors.append(exc)
                else:
                    record["fd"] = None
        if errors:
            raise errors[0]
