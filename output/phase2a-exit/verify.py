"""Verify Phase 2A exit review, explicit approval and frozen historical evidence."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_bytes(commit, name):
    return subprocess.run(['git', 'show', commit + ':' + name], cwd=ROOT,
                          capture_output=True, check=True).stdout

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    for name, expected in evidence['sources'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    package = ROOT / 'packages/core'
    inventory = {p.relative_to(ROOT).as_posix() for p in package.rglob('*') if p.is_file()
                 and not {'node_modules', 'dist'} & set(p.relative_to(package).parts)}
    assert inventory == {name for name in evidence['sources'] if name.startswith('packages/core/')}
    verification = json.loads((OUTPUT / 'verification.json').read_text(encoding='utf-8'))
    preflight = json.loads((OUTPUT / 'preflight.json').read_text(encoding='utf-8'))
    assert evidence['sources'] == verification['sources'] == preflight['sources']
    assert verification['preflightSha256'] == digest((OUTPUT / 'preflight.json').read_bytes())
    assert preflight['planSha256'] == digest((OUTPUT / 'TEST-PLAN.md').read_bytes())
    assert [step['step'] for step in verification['steps']] == ['build', 'boundary', 'tests']
    assert all(step['exitCode'] == 0 for step in verification['steps'])
    assert verification['testCounts'] == {'tests': 100, 'pass': 100, 'fail': 0, 'cancelled': 0, 'skipped': 0}
    history = [('phase1a-core', '4f237b1'), ('phase1b-core', '11e4905'),
               ('attention-resolution', 'ace16a6'), ('task-registry', 'ab8da5f'), ('team-engine-entry', '8f2d0a2'), ('phase2a-session', '8ba0f17'), ('phase2a-inboxes', '3abe01a'), ('phase2a-stop', 'b086be1'), ('phase2a-lifecycle', '93f417d')]
    for folder, commit in history:
        name = 'output/' + folder + '/evidence.json'
        raw = (ROOT / name).read_bytes()
        assert raw == git_bytes(commit, name), 'historical manifest changed'
        historical = json.loads(raw)
        for source, expected in {**historical.get('sources', {}), **historical.get('documents', {})}.items():
            data = git_bytes(commit, source)
            if folder == 'phase1b-core' and source == 'README.md':
                assert b'\r\n' not in data
                data = data.replace(b'\n', b'\r\n')
            assert digest(data) == expected, 'historical source: ' + source
            if folder == 'phase2a-lifecycle' and source.startswith('packages/core/') and source != 'packages/core/README.md':
                assert digest((ROOT / source).read_bytes()) == expected, 'qualified baseline altered: ' + source
        for artifact, expected in historical['artifacts'].items():
            assert digest((ROOT / 'output' / folder / artifact).read_bytes()) == expected, 'historical artifact: ' + artifact
    approval_name = 'output/phase2a-approval/approval.json'
    assert (ROOT / approval_name).read_bytes() == git_bytes('4ce785d', approval_name)
    approval = json.loads((ROOT / approval_name).read_text(encoding='utf-8'))
    assert approval['developmentAuthorized'] and approval['executionRequiresParentSourceReview']
    assert approval['response'] == 'Approve the internal Phase 2A amendment'
    for name, expected in approval['proposalArtifacts'].items():
        assert digest(git_bytes('8f2d0a2', name)) == expected
    decision = json.loads((OUTPUT / 'decision.json').read_text(encoding='utf-8'))
    assert decision['phase2aVerdict'] == 'PASS_BOUNDED_INTERNAL_CONTRACT'
    assert decision['nativeProviderIntegration'] == 'HOLD'
    assert decision['newConstructionAuthorized'] is False
    assert decision['verificationSha256'] == digest((OUTPUT / 'verification.json').read_bytes())
    assert decision['matrixSha256'] == digest((OUTPUT / 'MATRIX.md').read_bytes())
    assert decision['verifiedTests'] == 100 and decision['failedTests'] == decision['skippedTests'] == 0
    assert preflight['runtime'] == {'node': 'v26.7.0', 'platform': 'win32', 'arch': 'x64', 'modules': '147'}
    print('Phase 2A bounded contract accepted: 100 passing tests; broader engine deferred; integration HOLD')

if __name__ == '__main__':
    main()
