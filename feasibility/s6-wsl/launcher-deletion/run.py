"""Fresh mock group deletion qualification; default verifies saved public output."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import unittest
import uuid

from results import CASES, LIMITS, canonical, validate_records

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / "output/s6-launcher-deletion"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    files = [*SOURCE.glob("*.py"), *(SOURCE.parent / "launcher-retention").glob("*.py"),
             *(SOURCE.parent / "consolidated-launcher").glob("*.py")]
    files += [SOURCE.parent / "private-capture-store" / name for name in ("store.py", "winacl.py")]
    files += [SOURCE.parent / "private-matrix" / name for name in ("private_storage.py", "contract.py")]
    files += [SOURCE.parent / "linux-capture-store/store.py"]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(files)}


def fingerprint(manifest):
    return hashlib.sha256(canonical({"sources": manifest, "limits": LIMITS, "cases": CASES}).encode()).hexdigest()


def artifacts(destination):
    return {path.name: sha(path) for path in sorted(destination.iterdir())
            if path.is_file() and path.name != "evidence.json"}


def capture(destination):
    if os.name != "nt":
        raise ValueError("Windows-required")
    frozen = sources()
    digest = fingerprint(frozen)
    destination.mkdir(parents=True, exist_ok=True)
    with (destination / "input.json").open("x", encoding="utf-8") as stream:
        json.dump({"sources": frozen, "sourceSetSha256": digest, "limits": LIMITS}, stream, indent=2)
    import integration
    log = io.StringIO()
    outcome = unittest.TextTestRunner(stream=log, verbosity=2).run(integration.suite(digest))
    if not outcome.wasSuccessful():
        print(log.getvalue())
        raise RuntimeError("deletion-fixture-failed-private-evidence-retained")
    if sources() != frozen:
        raise ValueError("sources-changed")
    validate_records(integration.RESULTS, digest)
    (destination / "observations.json").write_text(json.dumps(integration.RESULTS, indent=2) + "\n", encoding="utf-8")
    (destination / "tests.log").write_text("5 live managed deletion cases passed\n" + "\n".join(case + " ... PASS" for case in CASES) + "\n", encoding="utf-8")
    with (destination / "evidence.json").open("x", encoding="utf-8") as stream:
        json.dump({"sources": frozen, "sourceSetSha256": digest, "limits": LIMITS,
                   "liveTests": outcome.testsRun, "artifacts": artifacts(destination)}, stream, indent=2)
    print("5 live group deletion cases passed; historical captures untouched; native disabled; P2 OPEN")


def check():
    entry = json.loads((OUT / "input.json").read_bytes())
    evidence = json.loads((OUT / "evidence.json").read_bytes())
    current = sources()
    digest = fingerprint(current)
    for record in (entry, evidence):
        if record["sources"] != current or record["sourceSetSha256"] != digest or record["limits"] != LIMITS:
            raise ValueError("source-or-admission-mismatch")
    if evidence["liveTests"] != 5 or evidence["artifacts"] != artifacts(OUT):
        raise ValueError("artifact-mismatch")
    validate_records(json.loads((OUT / "observations.json").read_bytes()), digest)
    print("Saved reviewed group deletion: 5 live cases; bounded resume and terminal quarantine; P2 OPEN")


if __name__ == "__main__":
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
    destination = ROOT / ".git/tiye-launcher-deletion-development" / uuid.uuid4().hex if args.develop else OUT
    capture(destination) if args.capture or args.develop else check()
