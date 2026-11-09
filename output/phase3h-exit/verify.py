"""Verify the bounded Phase 3H exit decision against sealed qualification evidence."""
import json,re,subprocess,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUTPUT=Path(__file__).resolve().parent

def main():
    # Re-running the implementation verifier re-checks sources, compiled bytes,
    # approval, historical seals and the exact 588/36 counts.
    qualified=subprocess.run([sys.executable,'-X','utf8','-B',str(ROOT/'output/phase3h-failure/verify.py')],cwd=ROOT)
    assert qualified.returncode==0,'implementation qualification did not verify'
    decision=json.loads((OUTPUT/'decision.json').read_text(encoding='utf-8'))
    evidence=json.loads((ROOT/'output/phase3h-failure/evidence.json').read_text(encoding='utf-8'))
    assert decision['schema']=='tiye-phase3h-exit-decision-v1'
    assert decision['scope']=='INTERNAL_PHASE3H_LEADER_FAILURE_VIEW'
    assert decision['proposalCommit']=='93d6588'
    assert re.fullmatch(r'[0-9a-f]{7,40}',decision['implementationCommit'])
    assert decision['decision']=='PASS_BOUNDED_INTERNAL_CONTRACT' and decision['exceptionEnded']
    assert not decision['newConstructionAuthorized'] and not decision['releaseAllowed']
    assert decision['nativeProviderIntegration']=='HOLD'
    assert decision['architectureMapping']['4.2'].startswith('bounded Leader get_failures')
    assert set(decision['architectureMapping'])=={'4.2','4.7','5.1','5.3'}
    assert evidence['qualification']=='PASS_BOUNDED_IMPLEMENTATION_TESTS'
    assert evidence['phase3hExit']=='PENDING_SEPARATE_REVIEW'
    assert evidence['verifiedTests']==588 and evidence['retainedTests']==552 and evidence['newTests']==36
    assert evidence['nativeProviderIntegration']=='HOLD' and not evidence['releaseAllowed']
    sealed=subprocess.run(['git','show',decision['implementationCommit']+':output/phase3h-failure/evidence.json'],
        cwd=ROOT,capture_output=True,check=True).stdout
    assert sealed==(ROOT/'output/phase3h-failure/evidence.json').read_bytes(),'implementation commit does not seal this evidence'
    print('Phase3H exit: bounded acceptance; 588 passing tests (552 retained + 36 new); evidence sealed at '+decision['implementationCommit']+'; integration HOLD; exception ended')

if __name__=='__main__':main()
