#!/usr/bin/env python3
import json
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


os.setsid()
mode, folder, nonce = sys.argv[1:]
if os.getuid() != 1000 or mode not in {"stop-pending", "owner-loss", "transport-loss"}:
    raise SystemExit(2)
raw, initialize = read_object()
if not valid_initialize(initialize):
    raise SystemExit(1)
notification = None
if mode != "stop-pending":
    response = {"id": 1, "result": {"codexHome": "/fixture", "platformFamily": "unix",
        "platformOs": "linux", "userAgent": "lifecycle-fixture"}}
    sys.stdout.buffer.write(json.dumps(response).encode("utf-8") + b"\n")
    sys.stdout.buffer.flush()
    raw, notification = read_object()
    if notification != {"method": "initialized"}:
        raise SystemExit(1)
    sys.stderr.buffer.write(b"initialized-notification-observed\n")
    sys.stderr.buffer.flush()
with open("/proc/self/stat", encoding="ascii") as stream:
    start_ticks = int(stream.read().rsplit(")", 1)[1].split()[19])
with open("/proc/self/cgroup", encoding="utf-8") as stream:
    cgroup = stream.read().strip()
publish(folder, "protocol-live.json", {"pid": os.getpid(), "startTicks": start_ticks,
    "uid": os.getuid(), "nonce": nonce, "sid": os.getsid(0), "ppid": os.getppid(),
    "cgroup": cgroup, "initializeRequest": initialize, "initializedNotification": notification})
# A live uncooperative peer ensures EOF alone cannot produce a cleanup pass.
time.sleep(95)
raise SystemExit(74)
