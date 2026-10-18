#!/usr/bin/env python3
import json
import hashlib
import os
import sys
import tempfile
import time


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def read_object():
    raw = sys.stdin.buffer.readline(16385)
    if not raw or len(raw) > 16384 or not raw.endswith(b"\n") or b"\r" in raw:
        return raw, None
    try:
        value = json.loads(raw[:-1].decode("utf-8"), object_pairs_hook=unique_object)
    except (UnicodeDecodeError, ValueError):
        return raw, None
    return raw, value if isinstance(value, dict) else None


def valid_initialize(value):
    if (not isinstance(value, dict) or type(value.get("id")) is not int
            or value["id"] != 1 or value.get("method") != "initialize"):
        return False
    params = value.get("params")
    if not isinstance(params, dict):
        return False
    client = params.get("clientInfo")
    return (
        set(value) == {"id", "method", "params"}
        and params.get("capabilities") == {"experimentalApi": False}
        and isinstance(client, dict)
        and isinstance(client.get("name"), str)
        and bool(client["name"])
        and isinstance(client.get("version"), str)
        and bool(client["version"])
    )


def publish(folder, name, value):
    fd, temp_path = tempfile.mkstemp(dir=folder, prefix=".protocol-")
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp_path, os.path.join(folder, name))


from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import profile


def identity(nonce, initialize, notification, init_hash):
    with open("/proc/self/stat", encoding="ascii") as stream:
        start_ticks = int(stream.read().rsplit(")", 1)[1].split()[19])
    with open("/proc/self/cgroup", encoding="utf-8") as stream:
        cgroup = stream.read().strip()
    return {"pid": os.getpid(), "startTicks": start_ticks, "uid": os.getuid(),
        "nonce": nonce, "sid": os.getsid(0), "ppid": os.getppid(), "cgroup": cgroup,
        "initializeRequest": initialize, "initializedNotification": notification, "initializeBytesSha256": init_hash}


def send_response(mode):
    if mode == "invalid-raw":
        sys.stdout.buffer.write(b"\xff\n")
    else:
        response = {"id": 2 if mode == "foreign" else 1, "result": {
            "codexHome": "/fixture", "platformFamily": "unix", "platformOs": "linux",
            "userAgent": "consolidated-fixture"}}
        sys.stdout.buffer.write(json.dumps(response).encode("utf-8") + b"\n")
    sys.stdout.buffer.flush()


def initialized():
    raw, notification = read_object()
    if notification != {"method": "initialized"}:
        raise ValueError("initialized-not-received")
    sys.stderr.buffer.write(b"initialized-notification-observed\n")
    sys.stderr.buffer.flush()
    return notification, hashlib.sha256(raw).hexdigest()


def completion(folder, receipt):
    unexpected = 0
    while True:
        chunk = sys.stdin.buffer.read1(65536)
        if not chunk:
            break
        unexpected += len(chunk)
    receipt.update(stdinEof=True, unexpectedInputBytes=unexpected)
    publish(folder, "protocol-receipt.json", receipt)
    release = Path(folder) / "release-peer"
    deadline = time.monotonic() + 30
    while not release.exists():
        if time.monotonic() >= deadline:
            raise ValueError("peer-release-missing")
        time.sleep(0.01)
    if release.read_text() != receipt['nonce'] or unexpected:
        raise ValueError("peer-release-or-input-mismatch")


os.setsid()
mode, folder, nonce = sys.argv[1:]
if os.getuid() != 1000 or mode not in profile.MODES:
    raise SystemExit(2)
raw, initialize = read_object()
if not valid_initialize(initialize):
    raise SystemExit(1)
notification, notify_hash = None, None
init_hash = hashlib.sha256(raw).hexdigest()
if mode in profile.BASELINE or mode == "stop-pending":
    publish(folder, "protocol-live.json", identity(nonce, initialize, None, init_hash))
if mode != "stop-pending":
    send_response(mode)
    if mode not in ("foreign", "invalid-raw"):
        notification, notify_hash = initialized()
if mode in profile.BASELINE:
    completion(folder, {'nonce': nonce, 'pid': os.getpid(), 'initializeRequest': initialize,
        'initializedNotification': notification, 'initializeBytesSha256': init_hash,
        'initializedBytesSha256': notify_hash})
else:
    if mode != "stop-pending":
        publish(folder, "protocol-live.json", identity(nonce, initialize, notification, init_hash))
    # EOF must not substitute for Stop or lease expiry in interruption cases.
    time.sleep(95)
    raise SystemExit(74)
