import hashlib
import json
import math
from pathlib import Path, PurePosixPath

_FIELDS = {"binary", "binarySha256", "installationSha256", "executed"}
_ARGV_TAIL = ["app-server", "--listen", "stdio://"]


def _canonical(value):
    def check(item):
        kind = type(item)
        if item is None or kind in (str, bool, int):
            return
        if kind is float:
            if not math.isfinite(item):
                raise ValueError("non-finite JSON number")
            return
        if kind is list:
            for child in item:
                check(child)
            return
        if kind is dict:
            if any(type(key) is not str for key in item):
                raise ValueError("JSON object keys must be strings")
            for child in item.values():
                check(child)
            return
        raise ValueError("value is not JSON-native")

    check(value)
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")


def _is_sha256(value):
    return (
        type(value) is str
        and len(value) == 64
        and all(char in "0123456789abcdef" for char in value)
    )


def _validate_candidate(item):
    if type(item) is not dict or set(item) != _FIELDS:
        raise ValueError("candidate must have exactly the required fields")

    binary = item["binary"]
    if type(binary) is not str or "\\" in binary:
        raise ValueError("binary must be a canonical POSIX path")
    posix = PurePosixPath(binary)
    if (
        not posix.is_absolute()
        or binary.startswith("//")
        or ".." in posix.parts
        or str(posix) != binary
    ):
        raise ValueError("binary must be a canonical absolute POSIX path")

    for field in ("binarySha256", "installationSha256"):
        if not _is_sha256(item[field]):
            raise ValueError(f"{field} must be lowercase SHA-256 hex")
    if type(item["executed"]) is not bool or item["executed"] is not False:
        raise ValueError("candidate must have executed=False")


def prepare(candidate, expected, config, expected_config):
    """Build a future plan only; this function does not execute or admit anything."""
    _validate_candidate(candidate)
    _validate_candidate(expected)
    candidate_bytes = _canonical(candidate)
    if candidate_bytes != _canonical(expected):
        raise ValueError("candidate differs from the frozen saved installation")

    config_bytes = _canonical(config)
    if config_bytes != _canonical(expected_config):
        raise ValueError("config differs from the frozen expected config")
    if type(config) is not dict:
        raise ValueError("config must be an object")
    if config.get("nativeExecutionAllowed") is not False:
        raise ValueError("native execution must remain disabled")
    if config.get("argvTail") != _ARGV_TAIL or type(config.get("argvTail")) is not list:
        raise ValueError("argvTail is not the fixed server argument list")
    if config.get("experimentalApi") is not False:
        raise ValueError("experimentalApi must be false")
    if type(config.get("profile")) is not dict or "sources" not in config:
        raise ValueError("config must include a profile object and full sources")
    if not _is_sha256(config.get("sourceSetSha256")):
        raise ValueError("sourceSetSha256 must be lowercase SHA-256 hex")

    source_payload = {
        "candidateInput": candidate,
        "fullSources": config["sources"],
        "profile": config["profile"],
    }
    source_hash = hashlib.sha256(_canonical(source_payload)).hexdigest()
    if source_hash != config["sourceSetSha256"]:
        raise ValueError("sourceSetSha256 does not bind candidate, sources, and profile")

    return {
        "futureCandidate": dict(candidate),
        "plannedArgv": [candidate["binary"], *_ARGV_TAIL],
        "configSha256": hashlib.sha256(config_bytes).hexdigest(),
        "sourceSetSha256": source_hash,
        "nativeExecutionAllowed": False,
        "runtimeBinaryRechecked": False,
    }


def verify_fixture_file(path, expected_path, expected_hash):
    """For real tempfile tests only: compare resolved paths and actual bytes; never execute."""
    if not _is_sha256(expected_hash):
        raise ValueError("expected_hash must be lowercase SHA-256 hex")
    actual = Path(path).resolve(strict=True)
    expected = Path(expected_path).resolve(strict=True)
    if actual != expected:
        raise ValueError("fixture path does not match expected path")
    actual_hash = hashlib.sha256(actual.read_bytes()).hexdigest()
    if actual_hash != expected_hash:
        raise ValueError("fixture bytes do not match expected hash")
    return actual_hash
