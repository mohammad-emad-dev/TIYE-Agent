"""Verify source-bound Phase 2F exit and immutable historical seals."""
import hashlib
import json
from pathlib import Path
import subprocess
from capture import files, compiled

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_bytes(commit, name):
    return subprocess.run(['git', 'show', commit + ':' + name], cwd=ROOT,
                          capture_output=True, check=True).stdout

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text())
    verification = json.loads((OUTPUT / 'verification.json').read_text())
    preflight = json.loads((OUTPUT / 'preflight.json').read_text())
    assert evidence['sources'] == verification['sources'] == preflight['sources'] == files()
    assert preflight['compiled'] == compiled()
    assert verification['preflightSha256'] == digest((OUTPUT / 'preflight.json').read_bytes())
    assert preflight['planSha256'] == digest((OUTPUT / 'TEST-PLAN.md').read_bytes())
    assert preflight['runtime'] == {'node': 'v26.7.0', 'platform': 'win32', 'arch': 'x64', 'modules': '147'}
    assert preflight['wholeSuiteTimeoutSeconds'] == 600
    assert [step['step'] for step in verification['steps']] == ['build', 'boundary', 'mock-boundary', 'tests']
    assert all(step['exitCode'] == 0 for step in verification['steps'])
    assert all(step['durationSeconds'] <= (600 if step['step']=='tests' else 60) for step in verification['steps'])
    assert verification['testCounts'] == {'tests': 228, 'pass': 228, 'fail': 0, 'cancelled': 0, 'skipped': 0}
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    for name, expected in preflight['dependencyFiles'].items():
        assert digest((ROOT / 'packages/core' / name).read_bytes()) == expected, name
    baseline = json.loads(git_bytes('b53dcb3', 'output/phase2e-exit/evidence.json'))
    for name, expected in baseline['sources'].items():
        if name.startswith('packages/core/'):
            assert evidence['sources'][name] == expected, 'accepted core changed: ' + name
    history = [('phase1a-core','4f237b1'),('phase1b-core','11e4905'),
        ('attention-resolution','ace16a6'),('task-registry','ab8da5f'),('team-engine-entry','8f2d0a2'),
        ('phase2a-session','8ba0f17'),('phase2a-inboxes','3abe01a'),('phase2a-stop','b086be1'),
        ('phase2a-lifecycle','93f417d'),('phase2a-exit','3d84035'),('phase2b-entry','2766d76'),
        ('phase2b-questions','e62cea3'),('phase2b-exit','95bd198'),('phase2c-entry','58187f8'),
        ('phase2c-mission','144ebbc'),('phase2c-exit','1bbb391'),('phase2d-entry','f4ef14f'),
        ('phase2d-failures','233e723'),('phase2d-exit','2aa8abf'),('phase2e-entry','c84c709'),
        ('phase2e-handoffs','48c0c4c'),('phase2e-exit','b53dcb3'),('phase2f-entry','4405293'),('phase2f-workers','f4d95a0')]
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
        for artifact, expected in historical['artifacts'].items():
            assert digest((ROOT / 'output' / folder / artifact).read_bytes()) == expected, 'historical artifact: ' + artifact
    for phase, commit in [('a','8f2d0a2'),('b','2766d76'),('c','58187f8'),('d','f4ef14f'),('e','c84c709'),('f','4405293')]:
        name = 'output/phase2' + phase + '-approval/approval.json'
        approval = json.loads((ROOT / name).read_text(encoding='utf-8'))
        assert approval['developmentAuthorized'] and approval['executionRequiresParentSourceReview']
        assert not approval['releaseAllowed']
        for proposal, expected in approval['proposalArtifacts'].items():
            assert digest(git_bytes(commit, proposal)) == expected
        if phase == 'f':
            assert approval['proposalCommit'] == commit
            assert approval['decision'] == 'delegated-owner-decision-to-proceed-with-presented-phase2f-contract'
            assert approval['response'] == "Do the right thing—it's up to you"
    baseline = json.loads(git_bytes('f4d95a0', 'output/phase2f-workers/evidence.json'))
    allowed = {'packages/mock-team/worker.cjs','packages/mock-team/controller.cjs','README.md','architecture/TIYE-Agent-Architecture.md'}
    assert {name for name in baseline['sources'] if evidence['sources'][name] != baseline['sources'][name]} == allowed
    assert set(evidence['sources']) - set(baseline['sources']) == {'packages/mock-team/test/exit.test.cjs'}
    red = json.loads((OUTPUT / 'red-verification.json').read_text())
    red_preflight = json.loads((OUTPUT / 'red-preflight.json').read_text())
    assert red['preflightSha256'] == digest((OUTPUT / 'red-preflight.json').read_bytes())
    assert red['sources'] == red_preflight['sources']
    assert red_preflight['runtime'] == preflight['runtime']
    assert red_preflight['compiled'] == preflight['compiled']
    assert red_preflight['dependencyFiles'] == preflight['dependencyFiles']
    assert red_preflight['planSha256'] == digest((OUTPUT / 'TEST-PLAN.md').read_bytes())
    assert red_preflight['wholeSuiteTimeoutSeconds'] == 60
    assert [step['exitCode'] for step in red['steps']] == [0,0,0,1]
    assert red['testCounts'] == {'tests':1,'pass':0,'fail':1,'cancelled':0,'skipped':0}
    for name, expected in baseline['sources'].items():
        assert red['sources'][name] == expected
    assert red['sources']['packages/mock-team/test/exit.test.cjs'] == digest((OUTPUT / 'red-exit-source.txt').read_bytes())
    assert evidence['phase2fExit'] == 'PASS_BOUNDED_INTERNAL_CONTRACT'
    assert evidence['nativeProviderIntegration'] == 'HOLD' and not evidence['releaseAllowed']
    decision = json.loads((OUTPUT / 'decision.json').read_text())
    assert decision['phase2fVerdict'] == 'PASS_BOUNDED_INTERNAL_CONTRACT'
    assert decision['verifiedTests'] == 228 and decision['failedTests'] == decision['skippedTests'] == 0
    assert decision['verificationSha256'] == digest((OUTPUT / 'verification.json').read_bytes())
    assert decision['matrixSha256'] == digest((OUTPUT / 'MATRIX.md').read_bytes())
    assert not decision['newConstructionAuthorized'] and not decision['releaseAllowed']
    assert not decision['fullArchitecture4EngineComplete'] and not decision['completeProductAccepted']
    print('Phase2F exit consistent: 228 passing tests; reproduced stop bug fixed; integration HOLD')

if __name__ == '__main__':
    main()
