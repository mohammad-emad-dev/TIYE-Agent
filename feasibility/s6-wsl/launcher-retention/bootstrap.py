"""Template embedded by the host with source bytes and the composition fingerprint."""
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
import tempfile
import zlib

EXTRAS = __EXTRAS__
FINGERPRINT = __FINGERPRINT__

if os.getuid() != 1000:
    raise ValueError("requires-uid1000")
raw = sys.stdin.buffer.readline(65537)
if len(raw) > 65536 or not raw.endswith(b"\n"):
    raise ValueError("bundle-budget")
bundle = json.loads(raw)
if set(bundle["files"]) != {"bridge.py", "service.py", "profile.py", "worker.py", "common.py",
                           "protocol_peer.py", "entry.py", "observer.py", "lease.py", "stop.py"}:
    raise ValueError("fixed-mock-bundle-required")
os.umask(0o077)
group = Path(tempfile.mkdtemp(prefix="tiye-retained-launcher-", dir="/tmp"))
runtime = group / "runtime"
runtime.mkdir(mode=0o700)
all_sources = {}
for name, encoded in {**bundle["files"], **EXTRAS}.items():
    payload = base64.b64decode(encoded, validate=True)
    if name in EXTRAS:
        payload = zlib.decompress(payload)
    digest = hashlib.sha256(payload).hexdigest()
    if name in bundle["files"] and digest != bundle["sha256"][name]:
        raise ValueError("bundle-hash")
    with (runtime / name).open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    all_sources[name] = digest
sys.path.insert(0, str(runtime))
import capture_store
import lifecycle
parent = os.open(group, capture_store.DIRECTORY_FLAGS)
transaction = lifecycle.LauncherCapture(parent, bundle["nonce"], True)
try:
    folder = os.open(runtime, capture_store.DIRECTORY_FLAGS)
    try:
        lifecycle.write_record(group / "group.json", {
            "nonce": bundle["nonce"], "mode": bundle["mode"], "sourceSetSha256": FINGERPRINT,
            "runtimeIdentity": capture_store.check_directory(folder, 0o700),
            "captureIdentity": transaction.directory_identity, "sources": all_sources,
            "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip()})
        for name, digest in all_sources.items():
            if lifecycle.sha(lifecycle.read_file(folder, name)) != digest:
                raise ValueError("prelaunch-runtime-source-mismatch")
        if set(os.listdir(parent)) != {"runtime", "group.json", bundle["nonce"]}:
            raise ValueError("prelaunch-group-inventory")
    finally:
        os.close(folder)
finally:
    transaction.close()
    os.close(parent)
print(json.dumps({"event": "prepared", "nonce": bundle["nonce"], "linuxRoot": str(runtime),
                  "captureParent": str(group), "captureId": bundle["nonce"], "uid": os.getuid(),
                  "runtimeSourceSha256": all_sources,
                  "storageBeforeSpawnVerified": True,
                  "linux": platform.platform(), "python": platform.python_version()}), flush=True)
import observer
result = []
original_emit = observer.emit


def emit(packet):
    if packet["event"] == "result":
        result.append(packet)
    original_emit(packet)


observer.emit = emit
observer.run(runtime, bundle["nonce"], bundle["mode"])
if len(result) != 1:
    raise ValueError("single-observer-result-required")
lifecycle.write_record(runtime / "observer-result.json", result[0])
lifecycle.write_record(runtime / "observer-finished.json", {
    "nonce": bundle["nonce"], "sourceSetSha256": FINGERPRINT,
    "resultSha256": lifecycle.sha(lifecycle.canonical(result[0])), "observerReturned": True})
