"""Public deletion verdicts omit raw manifests and machine identities."""
import json

CASES = ("complete", "resume", "metadata-quarantine", "owner-loss-refused", "unknown-file-refused")
LIMITS = {"P1": "OPEN", "P2": "OPEN", "A1": "BLOCKED", "phase1": "HOLD",
          "nativeAdmissionGranted": False, "nativeProviderRuns": 0, "automaticDeletion": False,
          "powerLossRecoveryQualified": False, "hostileFilesystemQualified": False,
          "historicalCapturesChanged": False, "secureEraseQualified": False}


def canonical(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False)


def selected(case, fingerprint):
    return {"case": case, "sourceSetSha256": fingerprint, "scope": "fresh-managed-mock-group-only",
            "lifecycleValidated": True, "reviewGranted": case in CASES[:3],
            "rootAbsent": case in CASES[:2], "resumeMeasured": case == "resume",
            "postReviewGuardsPassed": case == "complete",
            "callerReviewPersistedBeforeDeletion": case in CASES[:3],
            "finalMetadataQuarantined": case == "metadata-quarantine",
            "refusedWithoutDeletionRecords": case in CASES[3:], "limits": LIMITS.copy()}


def select_public(case, record, measurements, fingerprint):
    if (record["sourceSetSha256"] != fingerprint
            or record["case"] != ("owner-loss" if case == "owner-loss-refused" else "valid")):
        raise ValueError("source-or-mode-mismatch")
    if case in CASES[3:]:
        refusal = measurements["review"]
        if (refusal.get("decision") != "retained-refused" or refusal.get("reviewAbsent") is not True
                or refusal.get("intentAbsent") is not True or measurements.get("retainedUnchanged") is not True):
            raise ValueError("refusal-not-proven")
    else:
        if measurements["review"].get("decision") != "reviewed":
            raise ValueError("review-missing")
        if measurements.get("callerReviewPersisted") is not True:
            raise ValueError("caller-review-not-persisted")
        if case == "metadata-quarantine":
            if (measurements["final"].get("decision") != "quarantined-final-metadata"
                    or measurements["final"].get("noDeletionAttempted") is not True
                    or measurements.get("terminalIntentOnly") is not True):
                raise ValueError("terminal-quarantine-missing")
        elif measurements["final"].get("decision") != "removed" or measurements["final"].get("rootAbsent") is not True:
            raise ValueError("whole-group-removal-not-observed")
        if case == "resume" and measurements["first"].get("decision") != "interrupted":
            raise ValueError("interruption-not-observed")
        if case == "complete" and measurements.get("postReviewGuardsPassed") is not True:
            raise ValueError("post-review-guards-missing")
    return selected(case, fingerprint)


def validate_records(records, fingerprint):
    if canonical(records) != canonical([selected(case, fingerprint) for case in CASES]):
        raise ValueError("scope-case-or-admission-mismatch")
