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


def drain_to_eof():
    count = 0
    while True:
        chunk = sys.stdin.buffer.read1(65536)
        if not chunk:
            return count
        count += len(chunk)


os.setsid()
if len(sys.argv) != 4 or sys.argv[1] not in {"valid", "foreign", "invalid-raw"}:
    raise SystemExit(2)
mode, folder, nonce = sys.argv[1:]
if os.getuid() != 1000:
    raise SystemExit(1)

raw, initialize = read_object()
if not valid_initialize(initialize):
    raise SystemExit(1)

with open(f"/proc/{os.getpid()}/stat", encoding="ascii") as stream:
    stat = stream.read()
start_ticks = int(stat.rsplit(")", 1)[1].split()[19])
with open("/proc/self/cgroup", encoding="utf-8") as stream:
    cgroup = stream.read().strip()
publish(folder, "protocol-live.json", {
    "pid": os.getpid(),
    "startTicks": start_ticks,
    "uid": os.getuid(),
    "nonce": nonce,
    "sid": os.getsid(0),
    "ppid": os.getppid(),
    "cgroup": cgroup,
    "initializeRequest": initialize,
})

if mode == "invalid-raw":
    sys.stdout.buffer.write(b"\xff\n")
else:
    response = {
        "id": 1 if mode == "valid" else 2,
        "result": {
            "codexHome": "/fixture",
            "platformFamily": "unix",
            "platformOs": "linux",
            "userAgent": "fixture-λ",
        },
    }
    sys.stdout.buffer.write(
        json.dumps(response, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
    )
sys.stdout.buffer.flush()

notification = None
unexpected = 0
if mode == "valid":
    raw, candidate = read_object()
    if (isinstance(candidate, dict) and set(candidate) == {"method"}
            and candidate["method"] == "initialized"):
        notification = candidate
        sys.stderr.buffer.write(b"initialized-notification-observed\n")
        sys.stderr.buffer.flush()
    else:
        unexpected += len(raw)
else:
    raw, _ = read_object()
    unexpected += len(raw)
unexpected += drain_to_eof()

receipt = {
    "nonce": nonce,
    "pid": os.getpid(),
    "initializeRequest": initialize,
    "initializedNotification": notification,
    "stdinEof": True,
}
if unexpected:
    receipt["unexpectedInputBytes"] = unexpected
publish(folder, "protocol-receipt.json", receipt)

deadline = time.monotonic() + 30
release = os.path.join(folder, "release-peer")
while not os.path.exists(release):
    if time.monotonic() >= deadline:
        raise SystemExit(1)
    time.sleep(0.05)

raise SystemExit(0 if unexpected == 0 and (mode != "valid" or notification is not None) else 1)
