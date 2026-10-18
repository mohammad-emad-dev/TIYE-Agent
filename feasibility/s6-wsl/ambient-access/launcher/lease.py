import json
import math
import os
import tempfile
import threading
import time
from pathlib import Path


def _sample(path, nonce):
    data = json.loads(path.read_text(encoding="utf-8"))
    if type(data) is not dict or set(data) != {"nonce", "sequence", "received"}:
        raise ValueError("invalid lease keys")
    if type(data["nonce"]) is not str or data["nonce"] != nonce:
        raise ValueError("invalid nonce")
    sequence = data["sequence"]
    received = data["received"]
    if type(sequence) is not int or sequence <= 0:
        raise ValueError("invalid sequence")
    if type(received) is not float or not math.isfinite(received):
        raise ValueError("invalid timestamp")
    now = time.monotonic()
    if received > now:
        raise ValueError("future timestamp")
    return sequence, received, now


def _atomic_report(folder, report):
    fd, temp = tempfile.mkstemp(dir=folder, prefix=".lease-expired-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(report, stream, allow_nan=False, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, folder / "lease-expired.json")
    finally:
        try:
            os.unlink(temp)
        except FileNotFoundError:
            pass


def _finish(folder, reason, nonce, sample):
    sequence, received, observed = sample
    code = 71 if reason == "expired" else 72
    try:
        age = observed - received if received is not None else None
        _atomic_report(folder, {
            "reason": reason,
            "nonce": nonce,
            "pid": os.getpid(),
            "lastSequence": sequence,
            "lastReceived": received,
            "observedMonotonic": observed,
            "ageSeconds": age,
        })
    finally:
        os._exit(code)


def _watch(folder, nonce, sequence, received):
    path = folder / "lease.json"
    while True:
        try:
            sequence, received, now = _sample(path, nonce)
        except (OSError, ValueError, KeyError, TypeError):
            _finish(folder, "invalid", nonce, (sequence, received, time.monotonic()))
            return
        if now - received > 1.0:
            _finish(folder, "expired", nonce, (sequence, received, now))
            return
        time.sleep(0.025)


def start(folder: Path, nonce: str):
    folder = Path(folder)
    try:
        sequence, received, now = _sample(folder / "lease.json", nonce)
    except (OSError, ValueError, KeyError, TypeError):
        _finish(folder, "invalid", nonce, (None, None, time.monotonic()))
        return
    if now - received > 1.0:
        _finish(folder, "expired", nonce, (sequence, received, now))
        return
    # Same-user lifecycle races are accepted; this is not an isolation boundary.
    threading.Thread(
        target=_watch, args=(folder, nonce, sequence, received), daemon=True
    ).start()
