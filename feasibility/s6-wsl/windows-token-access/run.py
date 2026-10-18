"""Windows synthetic restricted-token qualification; default is offline."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / "output/s6-windows-token-access"
STORAGE = SOURCE.parent / "private-capture-store"
RIGHTS = {"data-or-list": 1, "write-or-create": 2, "read-control": 0x20000, "write-dacl": 0x40000}
LIMITS = {"P1": "OPEN", "P2": "OPEN", "A1": "BLOCKED", "phase1": "HOLD",
          "nativeAdmissionGranted": False, "otherAccountTested": False,
          "administratorIsolation": False, "launcherIntegrated": False,
          "hostileFilesystemQualified": False, "confinementEstablished": False}


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def sources():
    files = [*SOURCE.glob("*.py"), STORAGE / "store.py", STORAGE / "winacl.py"]
    return {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(files)}


def selected_shape():
    return {"schema": "tiye-windows-token-access-v1", "scope": "same-account-restricted-token-only",
            "pairedRequests": 20, "ownerBaselineBeforeAfter": True, "reverted": True,
            "controlPathsOpened": True, "payloadUnchanged": True,
            "cases": {target: {right: {"restrictedDenied5": True, "controlOpened": True}
                               for right in RIGHTS} for target in ("root", "run", "payload", "retention", "leaf")},
            "limits": LIMITS.copy()}


def select_public(report):
    if (report.get("scope") != "same-account-restricted-token-only"
            or any(report.get(flag) is not True for flag in
                   ("ownerBeforeAfter", "reverted", "controlPathsOpened", "payloadUnchanged"))):
        raise ValueError("scope-or-baseline-incomplete")
    rows = report["rows"]
    expected = [(target, right) for target in ("root", "run", "payload", "retention", "leaf") for right in RIGHTS]
    if len(rows) != 20 or [(row["target"], row["right"]) for row in rows] != expected:
        raise ValueError("paired-requests-incomplete")
    witness = rows[0]["token"]
    if (witness["user"] != report["owner"] or witness["restricted"] is not True
            or witness["restrictingSids"] != ["S-1-5-12"]
            or witness["enabledPrivileges"] != ["SeChangeNotifyPrivilege"]
            or witness["type"] != 2 or witness["impersonationLevel"] < 2):
        raise ValueError("token-witness-incomplete")
    for row in rows:
        if (row["requested"] != RIGHTS[row["right"]] or row["token"] != witness
                or row["protected"] != {"opened": False, "error": 5}
                or row["control"] != {"opened": True, "error": 0}):
            raise ValueError("paired-result-mismatch")
    return selected_shape()


def validate_public(record):
    if json.dumps(record, sort_keys=True) != json.dumps(selected_shape(), sort_keys=True):
        raise ValueError("public-schema-or-promotion-mismatch")


def capture(destination):
    if os.name != "nt":
        raise ValueError("Windows-required")
    frozen = sources()
    destination.mkdir(parents=True, exist_ok=True)
    with (destination / "input.json").open("x", encoding="utf-8") as stream:
        json.dump({"sources": frozen, "limits": LIMITS}, stream, indent=2)
    import probe
    sys.path.insert(0, str(STORAGE))
    import store
    subject, private = store.create_store(), None
    try:
        private = store.create_store()
        run = subject.new_run(uuid.uuid4().hex)
        payload = ("owned-token-canary-" + uuid.uuid4().hex).encode("ascii")
        run.write_bytes("stdout.bin", payload)
        control_root = subject.path.parent / ("tiye-token-control-" + uuid.uuid4().hex)
        control_run = control_root / uuid.uuid4().hex
        probe.create_control(control_root, subject.owner, True)
        probe.create_control(control_run, subject.owner, True)
        probe.create_control(control_run / "stdout.bin", subject.owner, False, payload)
        retention = run.read_bytes("retention.json")
        probe.create_control(control_run / "retention.json", subject.owner, False, retention)
        # A protected file and its grant-control share exactly the same RC-accessible parent.
        leaf = control_run / "protected-leaf.bin"
        handle = probe.winacl.create_file(leaf, subject.owner)
        descriptor, unused_security = store.verified_descriptor(handle, subject.owner, os.O_BINARY | os.O_RDWR)
        with os.fdopen(descriptor, "w+b") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        targets = [{"label": label, "path": str(path), "control": str(control), "directory": directory}
                   for label, path, control, directory in (
                       ("root", subject.path, control_root, True),
                       ("run", run.path, control_run, True),
                       ("payload", run.path / "stdout.bin", control_run / "stdout.bin", False),
                       ("retention", run.path / "retention.json", control_run / "retention.json", False),
                       ("leaf", leaf, control_run / "stdout.bin", False))]
        raw = private.new_run(uuid.uuid4().hex)
        system = os.environ["SystemRoot"]
        child = subprocess.run([sys.executable, "-I", "-S", "-B", str(SOURCE / "probe.py")],
                               input=json.dumps({"owner": subject.owner, "targets": targets}).encode(),
                               capture_output=True, timeout=30, close_fds=True,
                               env={"SystemRoot": system, "WINDIR": system, "PATH": system + "/System32"})
        raw.write_bytes("stdout.bin", child.stdout)
        raw.write_bytes("stderr.bin", child.stderr)
        if child.returncode != 0 or child.stderr:
            raise ValueError("worker-failed-raw-retained")
        report = json.loads(child.stdout)
        selected = select_public(report)
        if (sources() != frozen or run.read_bytes("stdout.bin") != payload
                or run.read_bytes("retention.json") != retention or leaf.read_bytes() != payload):
            raise ValueError("source-or-payload-changed")
        raw.record_completed_child(child)
        (destination / "observations.json").write_text(json.dumps(selected, indent=2) + "\n", encoding="utf-8")
        (destination / "tests.log").write_text("20 protected requests denied with error 5\n"
            "20 matching positive controls opened\nOwner before/after baselines and active-token witnesses passed\n"
            "Impersonation reverted; canary bytes unchanged\n", encoding="utf-8")
        with (destination / "evidence.json").open("x", encoding="utf-8") as stream:
            json.dump({"sources": frozen, "limits": LIMITS,
                       "artifacts": artifacts(destination)}, stream, indent=2)
        print("20 Windows restricted-token pairs passed; same account only; P2 OPEN; native disabled")
    finally:
        subject.close()
        if private is not None:
            private.close()


def artifacts(destination):
    return {path.name: sha(path.read_bytes()) for path in sorted(destination.iterdir())
            if path.is_file() and path.name != "evidence.json"}


def check():
    evidence = json.loads((OUT / "evidence.json").read_bytes())
    entry = json.loads((OUT / "input.json").read_bytes())
    if (evidence["sources"] != sources() or entry["sources"] != sources()
            or evidence["limits"] != LIMITS or entry["limits"] != LIMITS
            or evidence["artifacts"] != artifacts(OUT)):
        raise ValueError("saved-evidence-mismatch")
    validate_public(json.loads((OUT / "observations.json").read_bytes()))
    print("Saved Windows token probe: 20 paired requests; same-account restriction only; P2 OPEN")


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
        parser.error("report-and-review-required")
    target = ROOT / ".git/tiye-windows-token-development" / uuid.uuid4().hex if args.develop else OUT
    capture(target) if args.capture or args.develop else check()


if __name__ == "__main__":
    main()
