"""Mock storage composition qualification; default checks saved selected evidence."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import unittest
import uuid

from publication import LIMITS, canonical, validate_records

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / "output/s6-launcher-retention"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    files = [*SOURCE.glob("*.py"), *(SOURCE.parent / "consolidated-launcher").glob("*.py")]
    files += [SOURCE.parent / "private-capture-store" / name for name in ("store.py", "winacl.py")]
    files += [SOURCE.parent / "private-matrix" / name for name in ("private_storage.py", "contract.py")]
    files += [SOURCE.parent / "linux-capture-store/store.py"]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(files)}


def fingerprint(manifest):
    return hashlib.sha256(canonical({"sources": manifest, "limits": LIMITS,
        "cases": ["valid", "owner-loss", "unexpected-runtime"]}).encode()).hexdigest()


def artifacts(destination):
    return {path.name: sha(path) for path in sorted(destination.iterdir())
            if path.is_file() and path.name != "evidence.json"}


def capture(destination):
    if os.name != "nt":
        raise OSError("Windows-required")
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
        raise RuntimeError("storage-composition-failed-private-evidence-retained")
    if sources() != frozen:
        raise ValueError("sources-changed")
    validate_records(integration.RESULTS, digest)
    (destination / "observations.json").write_text(json.dumps(integration.RESULTS, indent=2) + "\n", encoding="utf-8")
    (destination / "tests.log").write_text("3 live managed composition cases passed\n"
        "valid: retained storage sealed after matched process/protocol witnesses\n"
        "owner-loss: storage remains uncertain despite process cleanup\n"
        "unexpected-runtime: payload writes and seal refused\n", encoding="utf-8")
    with (destination / "evidence.json").open("x", encoding="utf-8") as stream:
        json.dump({"sources": frozen, "sourceSetSha256": digest, "limits": LIMITS,
                   "liveTests": outcome.testsRun, "artifacts": artifacts(destination)}, stream, indent=2)
    print("3 live launcher/storage cases passed; native disabled; P1/P2 OPEN")


def check():
    evidence = json.loads((OUT / "evidence.json").read_bytes())
    entry = json.loads((OUT / "input.json").read_bytes())
    current = sources()
    digest = fingerprint(current)
    for record in (entry, evidence):
        if record["sources"] != current or record["sourceSetSha256"] != digest or record["limits"] != LIMITS:
            raise ValueError("source-or-limits-mismatch")
    if evidence["liveTests"] != 3 or evidence["artifacts"] != artifacts(OUT):
        raise ValueError("artifact-mismatch")
    validate_records(json.loads((OUT / "observations.json").read_bytes()), digest)
    print("Saved launcher storage composition: 3 live cases; integrated deletion unqualified; native disabled")


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
    destination = ROOT / ".git/tiye-launcher-retention-development" / uuid.uuid4().hex if args.develop else OUT
    capture(destination) if args.capture or args.develop else check()
