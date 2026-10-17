import asyncio
import base64
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


TTL = 15


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent,
        prefix=f".{path.name}.", delete=False
    ) as stream:
        json.dump(value, stream, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())
        temporary = Path(stream.name)
    os.replace(temporary, path)


def identity(role, nonce):
    stat = Path("/proc/self/stat").read_text()
    start_ticks = int(stat.rsplit(")", 1)[1].split()[19])
    return {
        "role": role,
        "pid": os.getpid(),
        "startTicks": start_ticks,
        "nonce": nonce,
        "sid": os.getsid(0),
        "ppid": os.getppid(),
        "cgroup": Path("/proc/self/cgroup").read_text().rstrip("\n"),
    }


def run(role, folder, nonce):
    if sys.platform != "linux" or os.getuid() != 1000:
        raise RuntimeError("mock integration requires Linux UID 1000")

    folder = Path(folder).resolve()
    if role in ("leaf", "sentinel"):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        atomic_json(folder / (role + '.json'), identity(role, nonce))
        time.sleep(TTL)
        return 0

    if role != "main":
        raise ValueError("role must be main, leaf, or sentinel")

    sys.path.insert(0, str(folder))
    import lease
    lease.start(folder, nonce)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    atomic_json(folder / 'main.json', identity(role, nonce))
    # Keep Popen alive; the service manager owns cleanup after this main exits.
    leaf = subprocess.Popen(
        [
            sys.executable, "-I", "-S", "-B", str(Path(__file__).resolve()),
            "leaf", str(folder), nonce,
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8'},
        start_new_session=True,
        close_fds=True,
    )

    run_protocol(folder, nonce)
    deadline = time.monotonic() + TTL
    release = folder / "release-main"
    while not release.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    return 0


def run_protocol(folder, nonce):
    mode = (folder / "mode.txt").read_text(encoding="utf-8").strip()
    if mode not in ("pending", "initialized"):
        raise ValueError("invalid fixed protocol stage")

    sys.path.insert(0, str(folder))
    import transport
    from owned import OwnedChild

    handshake = transport.Handshake(home="/fixture")
    owner = OwnedChild()
    child_membership = {}

    def register(pid):
        owner.register(pid)
        child_membership['identity'] = owner.expected
        child_membership['cgroup'] = (Path('/proc') / str(pid) / 'cgroup').read_text().strip()
        atomic_json(folder / 'registered.json', child_membership)

    context = {
        "seconds": 12,
        "spawnSeconds": 1,
        "workSeconds": 5,
        "cleanupWaitSeconds": 2,
        "limits": {"stdout": 4096, "stderr": 4096},
        "cwd": str(folder),
        "env": {"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8"},
        "initial": transport.wire({
            "id": 1,
            "method": "initialize",
            "params": {
                "capabilities": {"experimentalApi": False},
                "clientInfo": {"name": "tiye-mock", "version": "1"},
            },
        }),
        "second": transport.wire({"method": "initialized"}),
        "ready": lambda: handshake.accepted,
        "allowed": handshake.reply_allowed,
        "feed": handshake.feed,
        "eof": handshake.eof,
        "spawned": register,
        "signal": owner.send,
    }
    command = [
        sys.executable, "-I", "-S", "-B",
        str(folder / "protocol_peer.py"), mode, str(folder), nonce,
    ]
    try:
        report, raw = asyncio.run(transport.observe(command, context))
    finally:
        if owner.fd is not None:
            os.close(owner.fd)

    atomic_json(folder / "protocol.json", {
        "report": report,
        "accepted": handshake.accepted,
        "handshakeFault": handshake.fault,
        "rawBase64": {
            name: base64.b64encode(data).decode("ascii")
            for name, data in raw.items()
        },
        "mockOnly": True,
        "nonce": nonce,
        "childMembership": child_membership,
    })


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise ValueError("usage: peer.py main|leaf|sentinel folder nonce")
    raise SystemExit(run(sys.argv[1], sys.argv[2], sys.argv[3]))
