"""Source-bound Linux finalization policy for this mock composition only."""
import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capture_store

ROLE_FILES = {"main.json", "leaf.json", "sentinel.json", "protocol-live.json", "descriptor.json",
              "lease.json", "service-command.json", "observer-result.json", "observer-finished.json"}
OPTIONAL = {"protocol-receipt.json", "reaped.json", "release-peer", "lease-expired.json"}
DIRECTORIES = {"home", "codex-home", "tmp"}


class RuntimeInventoryError(ValueError):
    pass


def canonical(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def write_record(path, record):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(canonical(record))
        stream.flush()
        os.fsync(stream.fileno())
    parent = os.open(path.parent, capture_store.DIRECTORY_FLAGS)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def read_file(parent, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        before = os.fstat(descriptor)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                or stat.S_IMODE(before.st_mode) != 0o600 or before.st_nlink != 1
                or before.st_size > 65536 or os.listxattr(descriptor)):
            raise ValueError("runtime-file-security-or-size")
        with os.fdopen(os.dup(descriptor), "rb") as stream:
            payload = stream.read(65537)
        after = os.fstat(descriptor)
        if (len(payload) != before.st_size or capture_store.fingerprint(before) != capture_store.fingerprint(after)
                or before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns):
            raise ValueError("runtime-file-changed")
        return payload
    finally:
        os.close(descriptor)


class LauncherCapture(capture_store.Capture):
    @classmethod
    def resume_empty(cls, parent, nonce):
        transaction = cls(parent, nonce)
        try:
            expected = {"schema": "tiye-linux-synthetic-retention-v1", "run": nonce,
                        "uncertain": True, "automaticDeletion": False,
                        "completionScope": "synchronous-storage-only"}
            if (set(os.listdir(transaction.directory)) != {"retention.json"}
                    or json.loads(transaction.read("retention.json")[0]) != expected):
                raise ValueError("only-empty-awaiting-evidence-may-resume")
            transaction.writable = True
            return transaction
        except (OSError, ValueError):
            transaction.close()
            raise


def snapshot(runtime, sources):
    names = set(os.listdir(runtime))
    expected = set(sources) | ROLE_FILES | DIRECTORIES
    if not expected <= names or names - expected - OPTIONAL:
        raise RuntimeInventoryError("unexpected-runtime-inventory")
    files = {}
    for name in sorted(names - DIRECTORIES):
        payload = read_file(runtime, name)
        if name in sources and sha(payload) != sources[name]:
            raise ValueError("runtime-source-changed")
        files[name] = base64.b64encode(payload).decode("ascii")
    for name in DIRECTORIES:
        descriptor = os.open(name, capture_store.DIRECTORY_FLAGS, dir_fd=runtime)
        try:
            capture_store.check_directory(descriptor, 0o700)
            if os.listdir(descriptor):
                raise RuntimeInventoryError("unexpected-runtime-directory-content")
        finally:
            os.close(descriptor)
    archive = canonical({"files": files, "emptyDirectories": sorted(DIRECTORIES)})
    if len(archive) > 131072:
        raise ValueError("uncompressed-runtime-budget")
    return archive, files


def finalize(packet):
    import validation
    record = packet["record"]
    validation.validate_lifecycle(record)
    runtime_path = Path(__file__).resolve().parent
    if (Path(record["runtime"]["linuxRoot"]) != runtime_path
            or Path(record["runtime"]["captureParent"]) != runtime_path.parent
            or record["case"] not in ("valid", "owner-loss") or os.getuid() != 1000):
        raise ValueError("fixed-runtime-finalizer-only")
    parent = os.open(runtime_path.parent, capture_store.DIRECTORY_FLAGS)
    runtime = os.open("runtime", capture_store.DIRECTORY_FLAGS, dir_fd=parent)
    transaction = None
    try:
        capture_store.check_directory(parent, 0o700)
        group = json.loads(read_file(parent, "group.json"))
        nonce = group["nonce"]
        if (group["bootId"] != Path("/proc/sys/kernel/random/boot_id").read_text().strip()
                or group["runtimeIdentity"] != capture_store.check_directory(runtime, 0o700)
                or group["sourceSetSha256"] != record["sourceSetSha256"]
                or group["sources"] != record["runtime"]["runtimeSourceSha256"]
                or group["mode"] != record["case"] or record["linux"]["nonce"] != nonce
                or record["runtime"]["storageBeforeSpawnVerified"] is not True
                or record["runtime"]["captureId"] != nonce):
            raise ValueError("group-run-or-boot-identity-mismatch")
        observed = json.loads(read_file(runtime, "observer-result.json"))
        finished = json.loads(read_file(runtime, "observer-finished.json"))
        if (canonical(observed) != canonical(record["linux"])
                or finished != {"nonce": nonce, "sourceSetSha256": group["sourceSetSha256"],
                                "resultSha256": sha(canonical(observed)), "observerReturned": True}):
            raise ValueError("observer-result-or-completion-mismatch")
        transaction = LauncherCapture.resume_empty(parent, nonce)
        if transaction.directory_identity != group["captureIdentity"]:
            raise ValueError("capture-directory-replaced")
        write_record(runtime_path.parent / "finalize-attempt.json", {
            "nonce": nonce, "witnessSha256": sha(canonical(record)), "automaticRetry": False})
        try:
            archive, files = snapshot(runtime, group["sources"])
        except RuntimeInventoryError:
            return {"decision": "quarantined", "reason": "unexpected-runtime-inventory",
                    "completionAbsent": "completion.json" not in os.listdir(transaction.directory),
                    "payloadsAbsent": set(os.listdir(transaction.directory)) == {"retention.json"},
                    "runtimeRetained": True, "identityBound": True, "observerBound": True}
        compressed = zlib.compress(archive)
        witness = zlib.compress(canonical({"record": record, "archiveSha256": sha(archive)}))
        transaction.write("stdout.bin", compressed)
        transaction.write("stderr.bin", witness)
        if transaction.read("stdout.bin")[0] != compressed or transaction.read("stderr.bin")[0] != witness:
            raise ValueError("capture-readback-mismatch")
        # validate_lifecycle has required the matching valid receipt/reap and both OS cleanup witnesses.
        sealed = record["case"] == "valid"
        if sealed:
            transaction.seal()
            transaction.review()
        return {"decision": "sealed" if sealed else "uncertainty-retained", "reason": "normal-receipt" if sealed else "owner-loss",
                "completionAbsent": "completion.json" not in os.listdir(transaction.directory),
                "payloadsAbsent": False, "runtimeRetained": True, "identityBound": True,
                "observerBound": True, "archiveReadback": True, "runtimeFileCount": len(files),
                "archiveBytes": len(compressed), "witnessBytes": len(witness)}
    finally:
        if transaction is not None:
            transaction.close()
        os.close(runtime)
        os.close(parent)


def audit_retained(packet):
    runtime = Path(__file__).resolve().parent
    record = packet["record"]
    if Path(record["runtime"]["linuxRoot"]) != runtime:
        raise ValueError("audit-runtime-mismatch")
    parent = os.open(runtime.parent, capture_store.DIRECTORY_FLAGS)
    transaction = None
    try:
        capture_store.check_directory(parent, 0o700)
        group = json.loads(read_file(parent, "group.json"))
        if group["nonce"] != record["linux"]["nonce"] or group["sourceSetSha256"] != record["sourceSetSha256"]:
            raise ValueError("audit-generation-mismatch")
        transaction = LauncherCapture(parent, group["nonce"])
        names = set(os.listdir(transaction.directory))
        if names - capture_store.FILES:
            raise ValueError("unexpected-capture-entry")
        return {"capture": {name: sha(transaction.read(name)[0]) for name in sorted(names)},
                "attemptSha256": sha(read_file(parent, "finalize-attempt.json"))}
    finally:
        if transaction is not None:
            transaction.close()
        os.close(parent)


if __name__ == "__main__":
    packet = sys.stdin.buffer.read(65537)
    if len(packet) > 65536:
        raise ValueError("finalization-input-budget")
    packet = json.loads(packet)
    print(json.dumps(audit_retained(packet) if packet.get("audit") is True else finalize(packet)), flush=True)
