"""Verify a pending proposal and saved-reference hashes; grants no construction."""
import hashlib
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
ARTIFACTS = {'README.md', 'AMENDMENT.md', 'CORE-SLICE.md', 'decision.json',
             'review.json', 'verification.json', 'verify.py'}
REFERENCES = {
    'architecture/TIYE-Agent-Architecture.md',
    'architecture/TIYE-Agent-Feasibility-Test-Plan.md',
    'output/phase0-readiness/ASSESSMENT.md',
    'feasibility/s1-terminal/RESULTS.md', 'feasibility/s1-terminal/tsconfig.json',
    'feasibility/s2-control/RESULTS.md', 'feasibility/s2-control/package.json',
    'feasibility/s3-worktrees/ASSESSMENT.md', 'feasibility/s3-worktrees/evidence/assessment.json',
    'feasibility/s3-worktrees/scripts/assess-s3.js',
    'feasibility/s5-performance/ui/input-backend-pair/README.md',
    'feasibility/s5-performance/ui/input-backend-pair/check-pair.js',
    'output/s5-input-backend-pair/comparison.json',
    'output/s6-assessment/README.md', 'output/s6-assessment/coverage.json',
    'output/s4-codex-outreach/README.md', 'output/s6-admission-reconciliation/status.json',
    'output/s6-native-contract/contract.json', 'feasibility/s6-wsl/native-contract/check.py',
    'output/s6-runtime-limits/README.md', 'output/s6-owner-preparation/README.md',
    'output/s6-owner-preparation/evidence.json', 'feasibility/s6-wsl/owner-preparation/check.py'}
CHECKS = {'s1-typecheck', 's2-offline-tests', 's3-saved-assessment',
          's5-saved-latency-evidence', 's6-native-plan', 's6-owner-evidence'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_decision(decision):
    expected = {
        'schema': 'tiye-phase1-entry-proposal-v1', 'date': '2026-10-23',
        'evidenceBaselineCommit': 'd675ed6', 'currentFullPhase1Gate': 'HOLD',
        'recommendation': 'approve-bounded-internal-phase1a-amendment',
        'ownerApproval': 'PENDING', 'proposalActivated': False,
        'internalCoreConstructionAllowed': False, 'nativeExecutionAllowed': False,
        'exportExecutionAllowed': False, 'releaseAllowed': False,
        'productReleaseScope': 'complete-product-unchanged',
        'sGates': {name: 'PARTIAL' for name in ('S1', 'S2', 'S3', 'S4', 'S5', 'S6')},
        'nativeGates': {'L1': 'PARTIAL', 'L2': 'PARTIAL', 'P1': 'OPEN', 'P2': 'OPEN', 'A1': 'BLOCKED'},
        'pendingNativeObservations': ['C0-effective-configuration', 'final-PATH'],
        'nextAfterExplicitApproval': 'phase1a-durable-command-event-store-and-replay',
        'amendment': 'AMENDMENT.md', 'implementationContract': 'CORE-SLICE.md', 'commands': []}
    if json.dumps(decision, sort_keys=True) != json.dumps(expected, sort_keys=True):
        raise ValueError('construction-proposal-drift-or-unauthorized-promotion')


def validate_checks(record):
    if (set(record) != {'scope', 'nodeVersion', 'checks', 'nativeExecutionAllowed', 'phase1ConstructionAllowed'}
            or record['scope'] != 'saved-evidence-and-local-checks-not-native-requalification'
            or record['nativeExecutionAllowed'] is not False
            or record['phase1ConstructionAllowed'] is not False):
        raise ValueError('entry-review-verification-scope')
    checks = record['checks']
    if (type(checks) is not list or len(checks) != len(CHECKS)
            or {entry['id'] for entry in checks} != CHECKS
            or any(type(entry['exitCode']) is not int or entry['exitCode'] != 0 for entry in checks)):
        raise ValueError('entry-review-check-set-or-failure')


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'artifacts', 'references', 'proposalActivated'}
            or evidence['proposalActivated'] is not False):
        raise ValueError('entry-review-evidence-scope')
    for field, names, base in (('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)):
        if set(evidence[field]) != names or any(digest(base / name) != sha
                                               for name, sha in evidence[field].items()):
            raise ValueError('entry-review-artifact-or-reference-drift')
    validate_decision(json.loads((OUT / 'decision.json').read_bytes()))
    validate_checks(json.loads((OUT / 'verification.json').read_bytes()))
    print('Pending construction proposal and saved references verified; full Phase 1 remains HOLD')


if __name__ == '__main__':
    verify()
