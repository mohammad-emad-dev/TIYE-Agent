"""Check the implemented 1A evidence and the frozen pre-amendment proposal."""
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
ARTIFACTS = {'README.md', 'APPROVAL.md', 'approval.json', 'review.json', 'verification.json', 'verify.py'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    package = ROOT / 'packages/core'
    paths = [p for p in package.rglob('*') if p.is_file()
             and not {'node_modules', 'dist'}.intersection(p.relative_to(package).parts)]
    paths.append(ROOT / 'architecture/TIYE-Agent-Architecture.md')
    return {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(paths)}


def historical_proposal():
    proposal = ROOT / 'output/phase1-entry-review'
    evidence = json.loads((proposal / 'evidence.json').read_bytes())
    for name, sha in evidence['artifacts'].items():
        if digest(proposal / name) != sha:
            raise ValueError('frozen-proposal-artifact-drift')
    for name, sha in evidence['references'].items():
        if name == 'architecture/TIYE-Agent-Architecture.md':
            captured = subprocess.run(['git', 'show', '2107f5c:' + name], cwd=ROOT,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            observed = hashlib.sha256(captured.stdout).hexdigest()
        else:
            observed = digest(ROOT / name)
        if observed != sha:
            raise ValueError('frozen-proposal-reference-drift')


def validate_status(approval):
    expected = {'schema': 'tiye-internal-phase1a-approval-v1', 'date': '2026-10-23',
        'authority': 'project-owner-explicit-chat-response',
        'response': 'Approve the internal Phase 1A amendment', 'proposalCommit': '2107f5c',
        'scope': 'INTERNAL_PHASE1A_ONLY', 'phase1aAccepted': True, 'effectRunnerPresent': False,
        'phase1bExecutionAllowed': False, 'nativeAgentExecutionAllowed': False,
        'exportExecutionAllowed': False, 'releaseAllowed': False,
        'fullIntegrationReadiness': 'HOLD'}
    if json.dumps(approval, sort_keys=True) != json.dumps(expected, sort_keys=True):
        raise ValueError('phase1a-scope-drift-or-promotion')


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'proposalEvidenceSha256'}
            or evidence['sources'] != sources() or set(evidence['artifacts']) != ARTIFACTS
            or evidence['proposalEvidenceSha256'] != digest(ROOT / 'output/phase1-entry-review/evidence.json')):
        raise ValueError('phase1a-source-or-reference-drift')
    if any(digest(OUT / name) != sha for name, sha in evidence['artifacts'].items()):
        raise ValueError('phase1a-artifact-drift')
    validate_status(json.loads((OUT / 'approval.json').read_bytes()))
    verification = json.loads((OUT / 'verification.json').read_bytes())
    if (verification['sources'] != sources() or verification['scope'] != 'internal-phase1a-windows-core'
            or verification['effectRunnerPresent'] is not False
            or verification['nativeAgentExecutionAllowed'] is not False
            or verification['releaseAllowed'] is not False):
        raise ValueError('phase1a-verification-scope')
    steps = verification['steps']
    if ([step['step'] for step in steps] != ['build', 'boundary', 'tests']
            or any(type(step['exitCode']) is not int or step['exitCode'] != 0 for step in steps)
            or any(type(steps[-1][key]) is not int or steps[-1][key] != count
                   for key, count in [('tests', 10), ('pass', 10), ('fail', 0), ('skipped', 0), ('cancelled', 0)])):
        raise ValueError('phase1a-incomplete-gates')
    historical_proposal()
    print('Internal Phase 1A implementation and approved scope verified; integration/release remain HOLD')


if __name__ == '__main__':
    verify()
