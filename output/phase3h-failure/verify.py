"""Verify implementation, exact owner approval and immutable accepted history."""
import atexit,hashlib,json,subprocess
from pathlib import Path
from capture import files,compiled

ROOT=Path(__file__).resolve().parents[2]
OUTPUT=Path(__file__).resolve().parent
def digest(data):return hashlib.sha256(data).hexdigest()
_git=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
def _close_git():
    _git.stdin.close();assert _git.wait(timeout=10)==0
atexit.register(_close_git)
def git_bytes(commit,name):
    assert '\n' not in commit+name and '\r' not in commit+name
    _git.stdin.write((commit+':'+name+'\n').encode('utf-8'));_git.stdin.flush()
    header=_git.stdout.readline().split();assert len(header)==3 and header[1]==b'blob',(commit,name,header)
    size=int(header[2]);raw=_git.stdout.read(size)
    assert len(raw)==size and _git.stdout.read(1)==b'\n'
    return raw

def main():
    e=json.loads((OUTPUT/'evidence.json').read_text())
    v=json.loads((OUTPUT/'verification.json').read_text())
    p=json.loads((OUTPUT/'preflight.json').read_text())
    assert e['sources']==v['sources']==p['sources']==files()
    assert p['compiled']==compiled()
    assert p['runtime']=={'node':'v26.7.0','platform':'win32','arch':'x64','modules':'147'}
    assert p['wholeSuiteTimeoutSeconds']==1320
    assert v['preflightSha256']==digest((OUTPUT/'preflight.json').read_bytes())
    assert p['planSha256']==digest((OUTPUT/'TEST-PLAN.md').read_bytes())
    assert [step['step'] for step in v['steps']]==['build','build-adapter','build-loop','boundary','mock-boundary','adapter-boundary','loop-boundary','focused','tests']
    assert all(step['exitCode']==0 and step['durationSeconds']<=(1320 if step['step']=='tests' else 240 if step['step']=='focused' else 60) for step in v['steps'])
    assert v['testCounts']=={'tests':588,'pass':588,'fail':0,'cancelled':0,'skipped':0}
    focused=json.loads((OUTPUT/'focused.json').read_text())
    assert focused['testCounts']=={'tests':36,'pass':36,'fail':0,'cancelled':0,'skipped':0}
    assert focused['stdoutSha256']==next(step['stdoutSha256'] for step in v['steps'] if step['step']=='focused')
    for name,expected in e['artifacts'].items():assert digest((OUTPUT/name).read_bytes())==expected,name
    for name,expected in p['dependencyFiles'].items():assert digest((ROOT/'packages/core'/name).read_bytes())==expected,name
    baseline=json.loads(git_bytes('96e0016','output/phase3g-exit/evidence.json'))
    for name,expected in baseline['sources'].items():
        if name.startswith(('packages/core/','packages/mock-team/')) or '/test/' in name or name.endswith(('src/core-context.ts','src/loop-contract.ts','src/report-contract.ts','src/validation.ts','src/question-contract.ts','src/core-report.ts','src/core-question.ts','src/core-mission.ts','src/core-coordination.ts','src/core-handoff.ts','src/mission-contract.ts','src/coordination-contract.ts','src/handoff-contract.ts')):
            assert e['sources'].get(name)==expected,'accepted protected source changed: '+name
    assert all(name.startswith(('packages/api-loop/','packages/api-adapter/','output/phase3h-approval/','output/phase3h-failure/','README.md','architecture/TIYE-Agent-Architecture.md')) for name in set(e['sources'])-set(baseline['sources']))
    approval=json.loads((ROOT/'output/phase3h-approval/approval.json').read_text(encoding='utf-8'))
    assert approval['response']=='approve Phase 3H' and approval['proposalCommit']=='93d6588'
    assert approval['developmentAuthorized'] and approval['executionRequiresParentSourceReview']
    assert approval['scope']=='INTERNAL_PHASE3H_LEADER_FAILURE_VIEW' and not approval['releaseAllowed']
    for name,expected in approval['proposalArtifacts'].items():assert digest(git_bytes('93d6588',name))==expected
    history=[('phase1a-core','4f237b1'),('phase1b-core','11e4905'),('attention-resolution','ace16a6'),
      ('task-registry','ab8da5f'),('team-engine-entry','8f2d0a2'),('phase2a-session','8ba0f17'),
      ('phase2a-inboxes','3abe01a'),('phase2a-stop','b086be1'),('phase2a-lifecycle','93f417d'),
      ('phase2a-exit','3d84035'),('phase2b-entry','2766d76'),('phase2b-questions','e62cea3'),
      ('phase2b-exit','95bd198'),('phase2c-entry','58187f8'),('phase2c-mission','144ebbc'),
      ('phase2c-exit','1bbb391'),('phase2d-entry','f4ef14f'),('phase2d-failures','233e723'),
      ('phase2d-exit','2aa8abf'),('phase2e-entry','c84c709'),('phase2e-handoffs','48c0c4c'),
      ('phase2e-exit','b53dcb3'),('phase2f-entry','4405293'),('phase2f-workers','f4d95a0'),
      ('phase2f-exit','7d97aa2'),('phase3a-entry','b138d72'),('phase3a-adapter','3b24e82'),('phase3a-exit','11eee3b'),('phase3b-entry','55bd266'),('phase3b-loop','8db6be7'),('phase3b-exit','a0b9805'),('phase3c-entry','cd5ec2f'),('phase3c-report','1bf5731'),('phase3c-exit','972aa4d'),('phase3d-entry','11b19a7'),('phase3d-question','1090901'),('phase3d-exit','119b176'),('phase3e-entry','c58d57f'),('phase3e-mission','8f15ee3'),('phase3e-exit','6a11f79'),('phase3f-entry','8fef7ae'),('phase3f-coordination','0b6e3c3'),('phase3f-exit','5726ac7'),('phase3g-entry','6639d5e'),('phase3g-handoff','b1cc5c3'),('phase3g-exit','96e0016')]
    for folder,commit in history:
        name='output/'+folder+'/evidence.json';raw=(ROOT/name).read_bytes()
        assert raw==git_bytes(commit,name),'historical manifest changed'
        historical=json.loads(raw)
        for source,expected in {**historical.get('sources',{}),**historical.get('documents',{})}.items():
            data=git_bytes(commit,source)
            if folder=='phase1b-core' and source=='README.md':
                assert b'\r\n' not in data;data=data.replace(b'\n',b'\r\n')
            assert digest(data)==expected,'historical source: '+source
        for artifact,expected in historical['artifacts'].items():
            assert digest((ROOT/'output'/folder/artifact).read_bytes())==expected,'historical artifact: '+artifact
    assert e['qualification']=='PASS_BOUNDED_IMPLEMENTATION_TESTS' and e['phase3hExit']=='PENDING_SEPARATE_REVIEW'
    assert e['nativeProviderIntegration']=='HOLD' and not e['releaseAllowed']
    print('Phase3H implementation:588 passing tests; core/mock-team, 552 prior cases and historical seals unchanged; integration HOLD; exit pending')

if __name__=='__main__':main()
