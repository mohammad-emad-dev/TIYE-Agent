"""Selected results only; all raw lifecycle/storage records stay private."""
import json

LIMITS = {"P1": "OPEN", "P2": "OPEN", "A1": "BLOCKED", "phase1": "HOLD",
          "nativeAdmissionGranted": False, "nativeProviderRuns": 0,
          "integratedDeletionQualified": False, "sameUidIsolation": False,
          "powerLossRecoveryQualified": False, "allNineModesQualified": False}
DECISIONS = {"valid": ("sealed", "normal-receipt"), "owner-loss": ("uncertainty-retained", "owner-loss"),
             "unexpected-runtime": ("quarantined", "unexpected-runtime-inventory")}


def canonical(record):
    return json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False)


def public_record(case, fingerprint):
    decision, reason = DECISIONS[case]
    return {"case": case, "sourceSetSha256": fingerprint, "scope": "managed-mock-storage-composition",
            "decision": decision, "reason": reason, "lifecycleValidated": True,
            "identityBound": True, "observerBound": True, "runtimeRetained": True,
            "completionAbsent": case != "valid", "payloadsAbsent": case == "unexpected-runtime",
            "archiveReadback": case != "unexpected-runtime", "limits": LIMITS.copy()}


def select_public(record, finalized, case, fingerprint):
    expected_mode = "owner-loss" if case == "owner-loss" else "valid"
    if record["case"] != expected_mode or record["sourceSetSha256"] != fingerprint:
        raise ValueError("case-source-mismatch")
    for flag in ("identityBound", "observerBound", "runtimeRetained"):
        if finalized.get(flag) is not True:
            raise ValueError("storage-witness-incomplete")
    expected = public_record(case, fingerprint)
    for field in ("decision", "reason", "completionAbsent", "payloadsAbsent"):
        if type(finalized.get(field)) is not type(expected[field]) or finalized[field] != expected[field]:
            raise ValueError("storage-decision-not-bound")
    if case != "unexpected-runtime":
        if (finalized.get("archiveReadback") is not True or not 1 <= finalized["archiveBytes"] <= 65536
                or not 1 <= finalized["witnessBytes"] <= 65536
                or finalized["archiveBytes"] + finalized["witnessBytes"] > 98304
                or not 14 <= finalized["runtimeFileCount"] <= 40):
            raise ValueError("archive-or-budget-not-validated")
    return expected


def validate_records(records, fingerprint):
    expected = [{**public_record(case, fingerprint), "repeatFinalizationRefused": True} for case in DECISIONS]
    if canonical(records) != canonical(expected):
        raise ValueError("composition-scope-or-publication-mismatch")
