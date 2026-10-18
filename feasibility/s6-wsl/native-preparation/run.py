"""Offline snapshot reconciliation. This module has no process execution path."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
OUT = "output/s6-native-preparation"
PACKAGE = OUT + "/package.json"
SAVED = "output/s4-codex-candidate/"
COHORTS = {
    "lifecycle": "output/s6-private-matrix/",
    "ambient": "output/s6-ambient-access/",
}
DOCUMENTS = (
    SAVED + "README.md", SAVED + "route.json", SAVED + "installation.json",
    SAVED + "PROVIDER-CLARIFICATION.md",
    "output/s6-consolidated-launcher/input.json",
    "architecture/TIYE-Agent-Architecture.md",
    "architecture/TIYE-Agent-Product-Specification.md",
    "output/s6-capture-access-review/README.md",
    "output/s6-private-capture-store/README.md",
    OUT + "/README.md", OUT + "/NEXT-STEP.md", OUT + "/review.json",
    "feasibility/s6-wsl/native-preparation/run.py",
    "feasibility/s6-wsl/native-preparation/test_preparation.py",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")


def load(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    def invalid(value):
        raise ValueError("non-finite JSON value")

    return json.loads(data.decode("utf-8"), object_pairs_hook=unique,
                      parse_constant=invalid)


def file_bytes(root, name):
    """Read only a canonical repository-relative regular file without links."""
    if type(name) is not str or "\\" in name or ":" in name:
        raise ValueError("non-canonical artifact path")
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or str(path) != name or not path.parts:
        raise ValueError("artifact path escapes or is ambiguous")
    current = root
    for part in path.parts:
        current = current / part
        if current.is_symlink() or current.is_junction():
            raise ValueError("linked artifact refused")
    if not current.is_file():
        raise ValueError("artifact is not a regular file")
    return current.read_bytes()


def build(root=ROOT):
    bindings = {}

    def bind(name):
        raw = file_bytes(root, name)
        bindings[name] = digest(raw)
        return raw

    def saved_json(name):
        return load(bind(name))

    for name in DOCUMENTS:
        bind(name)
    installation = saved_json(SAVED + "installation.json")
    route = saved_json(SAVED + "route.json")
    old = saved_json("output/s6-consolidated-launcher/input.json")
    linux = installation["linux"]
    candidate = old["preparedCandidate"]["futureCandidate"]
    if (candidate != old["futureNativeCandidate"]
            or candidate["executed"] is not False
            or candidate["binary"] != linux["binary"]
            or candidate["binarySha256"] != linux["binarySha256"]
            or candidate["installationSha256"] != bindings[SAVED + "installation.json"]):
        raise ValueError("saved candidate/installation mismatch")
    expected_argv = [candidate["binary"], "app-server", "--listen", "stdio://"]
    prepared = old["preparedCandidate"]
    if (prepared["plannedArgv"] != expected_argv
            or prepared["nativeExecutionAllowed"] is not False
            or prepared["runtimeBinaryRechecked"] is not False
            or old["nativeAdmissionGranted"] is not False):
        raise ValueError("saved preparation scope changed")
    if (route["requestedModel"] != "gpt-6-luna" or route["requestedEffort"] != "max"
            or route["operatorAccountDeclarationReceived"] is not True
            or route["operatorRouteChoiceReceived"] is not True
            or route["providerInquirySent"] is not False
            or route["integrationEligible"] is not False
            or route["phase1Construction"] != "HOLD"
            or installation["modelRequestRun"] is not False
            or linux["results"][0]["stdout"].strip() != "codex-cli 0.157.1"):
        raise ValueError("saved route changed; a new review is required")
    selected = [item for item in linux["inventory"]
                if linux["root"] + "/package/" + item["path"] == candidate["binary"]]
    if len(selected) != 1 or selected[0]["sha256"] != candidate["binarySha256"]:
        raise ValueError("candidate inventory mismatch")
    # The original version/help producer and its recorded raw outputs are bound too.
    for name, expected in installation["sourceHashes"].items():
        if digest(bind(name)) != expected:
            raise ValueError("installation source changed")
    for label in ("stdout", "stderr"):
        item = installation[label]
        raw = bind(SAVED + item["artifact"])
        if len(raw) != item["bytes"] or digest(raw) != item["sha256"]:
            raise ValueError("installation output changed")
    cohorts = {}
    for role, prefix in COHORTS.items():
        inputs = saved_json(prefix + "input.json")
        for suffix in ("README.md", "assessment.json", "evidence.json"):
            bind(prefix + suffix)
        for group in inputs["sources"].values():
            for name, expected in group.items():
                if digest(bind(name)) != expected:
                    raise ValueError("cohort source changed")
        cohorts[role] = {
            "inputSha256": bindings[prefix + "input.json"],
            "sourceSetSha256": inputs["sourceSetSha256"],
            "scope": "nine-mock-modes" if role == "lifecycle" else "valid-only-owned-resources",
            "nativeQualified": False,
        }
    if cohorts["lifecycle"]["sourceSetSha256"] == cohorts["ambient"]["sourceSetSha256"]:
        raise ValueError("separate cohorts collapsed")
    return {
        "schema": "tiye-native-preparation-v1",
        "snapshotDate": "2026-10-18",
        "mode": "offline-preparation-only",
        "candidate": {
            "id": "saved-linux-codex-0.157.1",
            "binarySha256": candidate["binarySha256"],
            "installationSha256": candidate["installationSha256"],
            "currentInstallationRechecked": False,
            "qualification": "saved-version-help-only",
        },
        "plan": {
            "executableLocation": "bound-saved-installation-reference",
            "argvTail": expected_argv[1:],
            "model": "gpt-6-luna", "effort": "max",
            "modelWireConfigurationQualified": False,
            "environmentNames": ["PATH", "LC_ALL", "HOME", "CODEX_HOME", "TMPDIR"],
            "environmentScope": "mock-profile-only-native-auth-unresolved",
        },
        "route": {
            "choice": "official-codex-own-account",
            "declarationReceived": True,
            "outreachAuthorizedInConversation": True,
            "savedInquiryState": "not-submitted-no-response-evidence",
            "currentPolicyRevalidated": False,
            "integrationEligible": False,
        },
        "cohorts": cohorts,
        "states": {"L1": "PARTIAL", "L2": "PARTIAL", "P1": "OPEN", "P2": "OPEN", "A1": "BLOCKED"},
        "nativeExecutionAllowed": False, "nativeAdmissionGranted": False,
        "phase1": "HOLD", "bindings": dict(sorted(bindings.items())),
    }


def verify(package, root=ROOT):
    # Exact canonical comparison rejects unknown/private fields, type changes and promotion.
    if canonical(package) != canonical(build(root)):
        raise ValueError("preparation package differs from bound saved inputs and scope")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="create a new package exclusively")
    parser.add_argument("--native", action="store_true", help="always refused")
    args = parser.parse_args(argv)
    if args.native:
        parser.error("native execution is disabled; this checker cannot launch a provider")
    package = build()
    path = ROOT / PACKAGE
    if args.write:
        with path.open("xb") as stream:
            stream.write(json.dumps(package, indent=2, ensure_ascii=False).encode("utf-8") + b"\n")
    verify(load(file_bytes(ROOT, PACKAGE)))
    print("Offline preparation verified; native disabled; L1/L2 PARTIAL P1/P2 OPEN A1 BLOCKED")


if __name__ == "__main__":
    main()
