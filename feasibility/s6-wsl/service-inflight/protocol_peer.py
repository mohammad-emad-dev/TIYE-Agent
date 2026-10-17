import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import time


def read_json_line():
    return json.loads(sys.stdin.buffer.readline())


def write_all(data):
    view = memoryview(data)
    while view:
        written = os.write(1, view)
        view = view[written:]


if len(sys.argv) != 4:
    raise SystemExit("usage: protocol_peer.py pending|initialized folder nonce")

stage, folder, nonce = sys.argv[1:]
if stage not in ("pending", "initialized"):
    raise ValueError("stage must be pending or initialized")
if sys.platform != "linux" or os.getuid() != 1000:
    raise RuntimeError("this mock requires Linux UID 1000")

signal.signal(signal.SIGTERM, signal.SIG_IGN)
os.setsid()

request = read_json_line()
if not isinstance(request, dict) or request.get("method") != "initialize":
    raise ValueError("expected initialize request")
if type(request.get("id")) is not int or request["id"] != 1:
    raise ValueError("expected initialize id 1")

notification = None
if stage == "initialized":
    response = {
        "id": 1,
        "result": {
            "codexHome": "/fixture",
            "platformFamily": "unix",
            "platformOs": "linux",
            "userAgent": "synthetic Unicode – λ 雪",
        },
    }
    payload = (json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8")
    cut = next(i + 1 for i, byte in enumerate(payload) if byte >= 0x80)
    write_all(payload[:cut])
    write_all(payload[cut:])

    notification = read_json_line()
    if notification != {"method": "initialized"}:
        raise ValueError("expected exact initialized notification")

stat_tail = Path("/proc/self/stat").read_text(encoding="ascii").rsplit(")", 1)[1].split()
record = {
    "pid": os.getpid(),
    "startTicks": int(stat_tail[19]),
    "uid": os.getuid(),
    "nonce": nonce,
    "sid": os.getsid(0),
    "ppid": os.getppid(),
    "cgroup": Path("/proc/self/cgroup").read_text(encoding="utf-8").strip(),
    "stage": stage,
    "initializeRequest": request,
    "initializedNotification": notification,
    "initializeReceived": True,
    "initializedReceived": stage == "initialized",
}

fd, temporary = tempfile.mkstemp(prefix=".protocol-live-", dir=folder)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    json.dump(record, stream, ensure_ascii=False, separators=(",", ":"))
    stream.flush()
    os.fsync(stream.fileno())
os.replace(temporary, os.path.join(folder, "protocol-live.json"))

deadline = time.monotonic() + 15
while time.monotonic() < deadline:
    time.sleep(max(0, deadline - time.monotonic()))
