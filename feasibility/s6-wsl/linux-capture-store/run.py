"""Windows/Ubuntu synthetic storage qualification; default checks saved public output."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / "output/s6-linux-capture-store"
STORAGE = ROOT / "feasibility/s6-wsl/private-capture-store"
CASES = (
    "test_content_drift_and_changed_review_refuse_deletion",
    "test_effective_directory_and_file_denial",
    "test_exact_and_excess_payload_limits",
    "test_missing_completion_after_metadata_unlink_is_quarantined",
    "test_process_exit_after_payload_unlink_can_resume",
    "test_real_partial_write_fault_cannot_seal",
    "test_reviewed_transaction_removed_nonrecursively",
    "test_uncertain_capture_cannot_be_deleted",
    "test_unknown_symlink_hardlink_and_mode_refuse_deletion",
)
LIMITS = {"P1": "OPEN", "P2": "OPEN", "A1": "BLOCKED", "phase1": "HOLD",
          "nativeAdmissionGranted": False, "launcherIntegrated": False,
          "windowsAlternateTokenTested": False, "powerLossRecoveryQualified": False,
          "hostileFilesystemQualified": False, "sameUidIsolation": False}
BOOTSTRAP = r'''
import base64, hashlib, json, os, sys, tempfile
from pathlib import Path
bundle = json.loads(sys.stdin.buffer.read(131073))
if set(bundle) != {"files", "hashes"} or set(bundle["files"]) != {"store.py", "linux_tests.py"}:
    raise ValueError("fixed-code-bundle-required")
root = Path(tempfile.mkdtemp(prefix="tiye-linux-store-code-", dir="/tmp"))
root.chmod(0o700)
for name, encoded in bundle["files"].items():
    payload = base64.b64decode(encoded, validate=True)
    if hashlib.sha256(payload).hexdigest() != bundle["hashes"][name]:
        raise ValueError("code-bundle-hash")
    with (root / name).open("xb") as stream:
        stream.write(payload)
    (root / name).chmod(0o600)
sys.path.insert(0, str(root))
import linux_tests
report = linux_tests.run()
report["bundleHashes"] = bundle["hashes"]
for name in ("store.py", "linux_tests.py"):
    (root / name).unlink()
# Bytecode caching is disabled by the host's -B switch.
root.rmdir()
report["codeBundleRemoved"] = True
print(json.dumps(report), flush=True)
sys.exit(0 if report["successful"] else 1)
'''


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def sources():
    files = [*SOURCE.glob("*.py"), STORAGE / "store.py", STORAGE / "winacl.py"]
    return {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(files)}


def select_public(raw, expected_hashes):
    if (type(raw) is not dict or raw.get("successful") is not True
            or type(raw.get("tests")) is not int or raw["tests"] != len(CASES)
            or raw.get("scope") != "synthetic-linux-store-only"
            or raw.get("codeBundleRemoved") is not True
            or raw.get("retained") is not True
            or raw.get("bundleHashes") != expected_hashes):
        raise ValueError("linux-storage-qualification-failed")
    log = raw.get("log", "")
    if not all(log.count(name + " (") == 1 and name in log for name in CASES):
        raise ValueError("missing-live-case")
    return {"schema": "tiye-linux-synthetic-store-v1", "liveTests": len(CASES),
            "cases": {name: True for name in CASES},
            "scope": "synthetic-linux-store-only", "limits": LIMITS.copy()}


def validate_public(selected):
    expected = {"schema": "tiye-linux-synthetic-store-v1", "liveTests": len(CASES),
                "cases": {name: True for name in CASES},
                "scope": "synthetic-linux-store-only", "limits": LIMITS.copy()}
    if json.dumps(selected, sort_keys=True) != json.dumps(expected, sort_keys=True):
        raise ValueError("public-schema-or-scope-mismatch")


def capture(destination):
    if os.name != "nt":
        raise ValueError("Windows-host-required")
    frozen = sources()
    code = {name: (SOURCE / name).read_bytes() for name in ("store.py", "linux_tests.py")}
    expected = {name: sha(payload) for name, payload in code.items()}
    packet = json.dumps({"files": {name: base64.b64encode(payload).decode("ascii")
                                  for name, payload in code.items()}, "hashes": expected}).encode()
    if len(packet) > 131072:
        raise ValueError("bundle-budget")
    destination.mkdir(parents=True, exist_ok=True)
    with (destination / "input.json").open("x", encoding="utf-8") as stream:
        json.dump({"sources": frozen, "limits": LIMITS}, stream, indent=2)
    # Reuse the measured Windows allocator without changing its sealed source.
    sys.path.insert(0, str(STORAGE))
    import store as windows_store
    private = windows_store.create_store()
    try:
        raw = private.new_run(uuid.uuid4().hex)
        child = subprocess.run(["wsl.exe", "-d", "Ubuntu", "-u", "root", "--exec",
                                "/usr/bin/python3", "-B", "-c", BOOTSTRAP],
                               input=packet, capture_output=True, timeout=120)
        raw.write_bytes("stdout.bin", child.stdout)
        raw.write_bytes("stderr.bin", child.stderr)
        if child.returncode != 0:
            raise ValueError("live-tests-failed-raw-retained")
        report = json.loads(child.stdout)
        selected = select_public(report, expected)
        if sources() != frozen:
            raise ValueError("sources-changed-during-capture")
        raw.record_completed_child(child)
        (destination / "observations.json").write_text(json.dumps(selected, indent=2) + "\n", encoding="utf-8")
        # Test names/outcomes contain no raw paths. Do not publish the raw Linux report.
        (destination / "tests.log").write_text(
            "\n".join(name + " ... PASS" for name in CASES) + "\n9 live Linux unittest cases passed\n",
            encoding="utf-8")
        evidence = {"sources": frozen, "limits": LIMITS,
                    "artifacts": artifact_hashes(destination)}
        with (destination / "evidence.json").open("x", encoding="utf-8") as stream:
            json.dump(evidence, stream, indent=2)
        print("9 live Linux storage cases passed; raw retained privately; native disabled; P2 OPEN")
    finally:
        private.close()


def artifact_hashes(destination):
    return {path.name: sha(path.read_bytes()) for path in sorted(destination.iterdir())
            if path.is_file() and path.name != "evidence.json"}


def check():
    evidence = json.loads((OUT / "evidence.json").read_bytes())
    entry = json.loads((OUT / "input.json").read_bytes())
    if (evidence["sources"] != sources() or entry["sources"] != sources()
            or evidence["limits"] != LIMITS or entry["limits"] != LIMITS
            or evidence["artifacts"] != artifact_hashes(OUT)):
        raise ValueError("saved-evidence-mismatch")
    validate_public(json.loads((OUT / "observations.json").read_bytes()))
    print("Saved Linux synthetic storage: 9 live cases; no native/launcher admission; privacy OPEN")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", action="store_true")
    parser.add_argument("--develop", action="store_true")
    parser.add_argument("--native", action="store_true")
    args = parser.parse_args()
    if args.native:
        parser.error("native-execution-disabled")
    if args.capture and args.develop:
        parser.error("choose-one-destination")
    if args.capture and not all((OUT / name).is_file() for name in ("README.md", "review.json")):
        parser.error("review-and-report-required")
    target = ROOT / ".git/tiye-linux-store-development" / uuid.uuid4().hex if args.develop else OUT
    capture(target) if args.capture or args.develop else check()


if __name__ == "__main__":
    main()
