"""Verify Phase 2E exit, scope decision and frozen historical evidence."""
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
    assert verification['testCounts'] == {'tests': 181, 'pass': 181, 'fail': 0, 'cancelled': 0, 'skipped': 0}
    history = [('phase1a-core', '4f237b1'), ('phase1b-core', '11e4905'),
               ('attention-resolution', 'ace16a6'), ('task-registry', 'ab8da5f'), ('team-engine-entry', '8f2d0a2'), ('phase2a-session', '8ba0f17'), ('phase2a-inboxes', '3abe01a'), ('phase2a-stop', 'b086be1'), ('phase2a-lifecycle', '93f417d'), ('phase2a-exit', '3d84035'), ('phase2b-entry', '2766d76'), ('phase2b-questions', 'e62cea3'), ('phase2b-exit', '95bd198'), ('phase2c-entry', '58187f8'), ('phase2c-mission', '144ebbc'), ('phase2c-exit', '1bbb391'), ('phase2d-entry', 'f4ef14f'), ('phase2d-failures', '233e723'), ('phase2d-exit', '2aa8abf'), ('phase2e-entry', 'c84c709'), ('phase2e-handoffs', '48c0c4c')]
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
    approval_name = 'output/phase2a-approval/approval.json'
    assert (ROOT / approval_name).read_bytes() == git_bytes('4ce785d', approval_name)
    approval = json.loads((ROOT / approval_name).read_text(encoding='utf-8'))
    assert approval['developmentAuthorized'] and approval['executionRequiresParentSourceReview']
    assert approval['response'] == 'Approve the internal Phase 2A amendment'
    for name, expected in approval['proposalArtifacts'].items():
        assert digest(git_bytes('8f2d0a2', name)) == expected
    second_name = 'output/phase2b-approval/approval.json'
    second = json.loads((ROOT / second_name).read_text(encoding='utf-8'))
    assert digest((ROOT / second_name).read_bytes()) == evidence['phase2bApprovalSha256']
    assert second['developmentAuthorized'] and second['executionRequiresParentSourceReview']
    assert second['proposalCommit'] == '2766d76' and second['decision'] == 'proceed-with-presented-phase2b-amendment'
    for name, expected in second['proposalArtifacts'].items():
        assert digest(git_bytes('2766d76', name)) == expected
    assert preflight['runtime'] == {'node': 'v26.7.0', 'platform': 'win32', 'arch': 'x64', 'modules': '147'}
    third_name = 'output/phase2c-approval/approval.json'
    third = json.loads((ROOT / third_name).read_text(encoding='utf-8'))
    assert digest((ROOT / third_name).read_bytes()) == evidence['phase2cApprovalSha256']
    assert third['response'] == 'Approve the internal Phase 2C amendment'
    assert third['proposalCommit'] == '58187f8' and third['developmentAuthorized']
    assert third['executionRequiresParentSourceReview'] and not third['releaseAllowed']
    for name, expected in third['proposalArtifacts'].items():
        assert digest(git_bytes('58187f8', name)) == expected
    assert evidence['phase2eExit'] == 'PASS_BOUNDED_INTERNAL_CONTRACT' and evidence['nativeProviderIntegration'] == 'HOLD'
    fourth_name = 'output/phase2d-approval/approval.json'
    fourth = json.loads((ROOT / fourth_name).read_text(encoding='utf-8'))
    assert digest((ROOT / fourth_name).read_bytes()) == evidence['phase2dApprovalSha256']
    assert fourth['response'] == "Do the right thing—it's up to you"
    assert fourth['decision'] == 'delegated-owner-decision-to-proceed-with-presented-phase2d-contract'
    assert fourth['proposalCommit'] == 'f4ef14f' and fourth['developmentAuthorized']
    assert fourth['executionRequiresParentSourceReview'] and not fourth['releaseAllowed']
    for name, expected in fourth['proposalArtifacts'].items():
        assert digest(git_bytes('f4ef14f', name)) == expected
    fifth_name = 'output/phase2e-approval/approval.json'
    fifth = json.loads((ROOT / fifth_name).read_text(encoding='utf-8'))
    assert digest((ROOT / fifth_name).read_bytes()) == evidence['phase2eApprovalSha256']
    assert fifth['response'] == "Do the right thing—it's up to you"
    assert fifth['decision'] == 'delegated-owner-decision-to-proceed-with-presented-phase2e-contract'
    assert fifth['proposalCommit'] == 'c84c709' and fifth['developmentAuthorized']
    assert fifth['executionRequiresParentSourceReview'] and not fifth['releaseAllowed']
    for name, expected in fifth['proposalArtifacts'].items():
        assert digest(git_bytes('c84c709', name)) == expected
    baseline = json.loads(git_bytes('48c0c4c', 'output/phase2e-handoffs/evidence.json'))
    for name, expected in baseline['sources'].items():
        assert evidence['sources'][name] == expected, 'accepted source changed: ' + name
    assert set(evidence['sources']) - set(baseline['sources']) == {'packages/core/test/handoff-exit.test.cjs'}
    decision = json.loads((OUTPUT / 'decision.json').read_text(encoding='utf-8'))
    assert decision['phase2eVerdict'] == 'PASS_BOUNDED_INTERNAL_CONTRACT' and decision['verifiedTests'] == 181
    assert not decision['newConstructionAuthorized'] and not decision['releaseAllowed']
    assert decision['verificationSha256'] == digest((OUTPUT / 'verification.json').read_bytes())
    assert decision['matrixSha256'] == digest((OUTPUT / 'MATRIX.md').read_bytes())
    print('Phase2E exit consistent: 181 passing tests; bounded contract accepted; integration HOLD')


if __name__ == '__main__':
    main()
