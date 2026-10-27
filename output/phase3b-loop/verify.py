"""Verify implementation, exact delegated approval and immutable accepted history."""
import hashlib,json,subprocess
from pathlib import Path
from capture import files,compiled

ROOT=Path(__file__).resolve().parents[2]
OUTPUT=Path(__file__).resolve().parent
def digest(data):return hashlib.sha256(data).hexdigest()
def git_bytes(commit,name):
    return subprocess.run(['git','show',commit+':'+name],cwd=ROOT,capture_output=True,check=True).stdout

def main():
    e=json.loads((OUTPUT/'evidence.json').read_text())
    v=json.loads((OUTPUT/'verification.json').read_text())
    p=json.loads((OUTPUT/'preflight.json').read_text())
    assert e['sources']==v['sources']==p['sources']==files()
    assert p['compiled']==compiled()
    assert p['runtime']=={'node':'v26.7.0','platform':'win32','arch':'x64','modules':'147'}
    assert p['wholeSuiteTimeoutSeconds']==780
    assert v['preflightSha256']==digest((OUTPUT/'preflight.json').read_bytes())
    assert p['planSha256']==digest((OUTPUT/'TEST-PLAN.md').read_bytes())
    assert [step['step'] for step in v['steps']]==['build','build-adapter','build-loop','boundary','mock-boundary','adapter-boundary','loop-boundary','tests']
    assert all(step['exitCode']==0 and step['durationSeconds']<=(780 if step['step']=='tests' else 60) for step in v['steps'])
    assert v['testCounts']=={'tests':309,'pass':309,'fail':0,'cancelled':0,'skipped':0}
    for name,expected in e['artifacts'].items():assert digest((OUTPUT/name).read_bytes())==expected,name
    for name,expected in p['dependencyFiles'].items():assert digest((ROOT/'packages/core'/name).read_bytes())==expected,name
    baseline=json.loads(git_bytes('11eee3b','output/phase3a-exit/evidence.json'))
    for name,expected in baseline['sources'].items():
        if name.startswith(('packages/core/','packages/mock-team/','output/')):
            assert e['sources'][name]==expected,'accepted protected source changed: '+name
    assert all(name.startswith(('packages/api-loop/','packages/api-adapter/','output/phase3b-approval/')) for name in set(e['sources'])-set(baseline['sources']))
    approval=json.loads((ROOT/'output/phase3b-approval/approval.json').read_text(encoding='utf-8'))
    assert approval['response']=="Do the right thing—it's up to you"
    assert approval['decision']=='delegated-owner-decision-to-proceed-with-presented-phase3b-contract'
    assert approval['proposalCommit']=='55bd266' and approval['developmentAuthorized'] and approval['executionRequiresParentSourceReview']
    assert approval['scope']=='INTERNAL_PHASE3B_SCRIPTED_LOOP_READ_ONLY_CORE' and not approval['releaseAllowed']
    for name,expected in approval['proposalArtifacts'].items():assert digest(git_bytes('55bd266',name))==expected
    history=[('phase1a-core','4f237b1'),('phase1b-core','11e4905'),('attention-resolution','ace16a6'),
      ('task-registry','ab8da5f'),('team-engine-entry','8f2d0a2'),('phase2a-session','8ba0f17'),
      ('phase2a-inboxes','3abe01a'),('phase2a-stop','b086be1'),('phase2a-lifecycle','93f417d'),
      ('phase2a-exit','3d84035'),('phase2b-entry','2766d76'),('phase2b-questions','e62cea3'),
      ('phase2b-exit','95bd198'),('phase2c-entry','58187f8'),('phase2c-mission','144ebbc'),
      ('phase2c-exit','1bbb391'),('phase2d-entry','f4ef14f'),('phase2d-failures','233e723'),
      ('phase2d-exit','2aa8abf'),('phase2e-entry','c84c709'),('phase2e-handoffs','48c0c4c'),
      ('phase2e-exit','b53dcb3'),('phase2f-entry','4405293'),('phase2f-workers','f4d95a0'),
      ('phase2f-exit','7d97aa2'),('phase3a-entry','b138d72'),('phase3a-adapter','3b24e82'),('phase3a-exit','11eee3b'),('phase3b-entry','55bd266')]
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
    assert e['qualification']=='PASS_BOUNDED_IMPLEMENTATION_TESTS' and e['phase3bExit']=='PENDING_SEPARATE_REVIEW'
    assert e['nativeProviderIntegration']=='HOLD' and not e['releaseAllowed']
    print('Phase3B implementation:309 passing tests; core/mock-team and historical seals unchanged; integration HOLD;exit pending')

if __name__=='__main__':main()
