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
    assert p['wholeSuiteTimeoutSeconds']==660
    assert v['preflightSha256']==digest((OUTPUT/'preflight.json').read_bytes())
    assert p['planSha256']==digest((OUTPUT/'TEST-PLAN.md').read_bytes())
    assert [step['step'] for step in v['steps']]==['build','build-adapter','boundary','mock-boundary','adapter-boundary','tests']
    assert all(step['exitCode']==0 and step['durationSeconds']<=(660 if step['step']=='tests' else 60) for step in v['steps'])
    assert v['testCounts']=={'tests':273,'pass':273,'fail':0,'cancelled':0,'skipped':0}
    for name,expected in e['artifacts'].items():assert digest((OUTPUT/name).read_bytes())==expected,name
    for name,expected in p['dependencyFiles'].items():assert digest((ROOT/'packages/core'/name).read_bytes())==expected,name
    baseline=json.loads(git_bytes('7d97aa2','output/phase2f-exit/evidence.json'))
    for name,expected in baseline['sources'].items():
        if name not in {'README.md','architecture/TIYE-Agent-Architecture.md'}:
            assert e['sources'][name]==expected,'accepted source changed: '+name
    extra=set(e['sources'])-set(baseline['sources'])
    assert extra and all(name.startswith(('packages/api-adapter/','output/phase3a-approval/')) for name in extra)
    approval=json.loads((ROOT/'output/phase3a-approval/approval.json').read_text(encoding='utf-8'))
    assert approval['response']=="Do the right thing—it's up to you"
    assert approval['decision']=='delegated-owner-decision-to-proceed-with-presented-phase3a-contract'
    assert approval['proposalCommit']=='b138d72' and approval['developmentAuthorized'] and approval['executionRequiresParentSourceReview']
    assert approval['scope']=='INTERNAL_PHASE3A_SCRIPTED_API_ADAPTER_ONLY' and not approval['releaseAllowed']
    for name,expected in approval['proposalArtifacts'].items():assert digest(git_bytes('b138d72',name))==expected
    history=[('phase1a-core','4f237b1'),('phase1b-core','11e4905'),('attention-resolution','ace16a6'),
      ('task-registry','ab8da5f'),('team-engine-entry','8f2d0a2'),('phase2a-session','8ba0f17'),
      ('phase2a-inboxes','3abe01a'),('phase2a-stop','b086be1'),('phase2a-lifecycle','93f417d'),
      ('phase2a-exit','3d84035'),('phase2b-entry','2766d76'),('phase2b-questions','e62cea3'),
      ('phase2b-exit','95bd198'),('phase2c-entry','58187f8'),('phase2c-mission','144ebbc'),
      ('phase2c-exit','1bbb391'),('phase2d-entry','f4ef14f'),('phase2d-failures','233e723'),
      ('phase2d-exit','2aa8abf'),('phase2e-entry','c84c709'),('phase2e-handoffs','48c0c4c'),
      ('phase2e-exit','b53dcb3'),('phase2f-entry','4405293'),('phase2f-workers','f4d95a0'),
      ('phase2f-exit','7d97aa2'),('phase3a-entry','b138d72'),('phase3a-adapter','3b24e82')]
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
    baseline=json.loads(git_bytes('3b24e82','output/phase3a-adapter/evidence.json'))
    allowed={'README.md','architecture/TIYE-Agent-Architecture.md','packages/api-adapter/README.md',
        'packages/api-adapter/src/adapter.ts','packages/api-adapter/src/types.ts','packages/api-adapter/src/scripted.ts'}
    assert {name for name in baseline['sources'] if e['sources'][name]!=baseline['sources'][name]}==allowed
    assert set(e['sources'])-set(baseline['sources'])=={'packages/api-adapter/test/exit.test.cjs'}
    original=json.loads(git_bytes('3b24e82','output/phase3a-adapter/preflight.json'))
    for mode in ['async','order']:
        prefix='red-'+mode+'-'
        red=json.loads((OUTPUT/(prefix+'verification.json')).read_text())
        redp=json.loads((OUTPUT/(prefix+'preflight.json')).read_text())
        assert red['preflightSha256']==digest((OUTPUT/(prefix+'preflight.json')).read_bytes())
        assert red['sources']==redp['sources']
        assert redp['runtime']==p['runtime'] and redp['dependencyFiles']==p['dependencyFiles']
        assert redp['compiled']==original['compiled']
        assert redp['planSha256']==digest((OUTPUT/'TEST-PLAN.md').read_bytes())
        assert redp['wholeSuiteTimeoutSeconds']==60
        assert [step['exitCode'] for step in red['steps']]==[0,0,0,0,0,1]
        assert red['testCounts']=={'tests':1,'pass':0,'fail':1,'cancelled':0,'skipped':0}
        for name,expected in baseline['sources'].items():assert red['sources'][name]==expected
        assert red['sources']['packages/api-adapter/test/exit.test.cjs']==e['sources']['packages/api-adapter/test/exit.test.cjs']
    assert e['phase3aExit']=='PASS_BOUNDED_INTERNAL_CONTRACT' and not e['releaseAllowed']
    assert e['nativeProviderIntegration']=='HOLD'
    decision=json.loads((OUTPUT/'decision.json').read_text())
    assert decision['phase3aVerdict']=='PASS_BOUNDED_INTERNAL_CONTRACT' and decision['verifiedTests']==273
    assert decision['verificationSha256']==digest((OUTPUT/'verification.json').read_bytes())
    assert decision['matrixSha256']==digest((OUTPUT/'MATRIX.md').read_bytes())
    assert not decision['newConstructionAuthorized'] and not decision['releaseAllowed'] and not decision['fullApiAdapterImplemented']
    print('Phase3A exit consistent:273 passing tests; observer regressions reproduced/fixed; integration HOLD')

if __name__=='__main__':main()
