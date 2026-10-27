"""Verify a pending scope proposal without executing a new runtime composition."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[2]
OUTPUT=Path(__file__).resolve().parent
def digest(data):return hashlib.sha256(data).hexdigest()
def main():
    e=json.loads((OUTPUT/'evidence.json').read_text())
    assert e['baselineCommit']=='6a11f79' and e['approvalStatus']=='PENDING' and not e['constructionAuthorized']
    assert e['nativeProviderIntegration']=='HOLD' and not e['releaseAllowed']
    for name,expected in e['artifacts'].items():assert digest((OUTPUT/name).read_bytes())==expected,name
    name='output/phase3e-exit/evidence.json';raw=(ROOT/name).read_bytes()
    original=subprocess.run(['git','show','6a11f79:'+name],cwd=ROOT,capture_output=True,check=True).stdout
    assert raw==original and digest(raw)==e['baselineManifestSha256']
    baseline=json.loads(raw);assert baseline['sources']==e['sources']
    for name,expected in baseline['sources'].items():assert digest((ROOT/name).read_bytes())==expected,name
    for name,expected in baseline['artifacts'].items():assert digest((ROOT/'output/phase3e-exit'/name).read_bytes())==expected,name
    inventory=set()
    for folder in ['core','mock-team','api-adapter','api-loop']:
        package=ROOT/'packages'/folder
        inventory.update(p.relative_to(ROOT).as_posix() for p in package.rglob('*') if p.is_file()
                         and not {'node_modules','dist'} & set(p.relative_to(package).parts))
    assert inventory=={name for name in baseline['sources'] if name.startswith('packages/')}
    for filename in ['README.md','AMENDMENT.md','CONTRACT.md','REVIEW.md']:
        for link in re.findall(r'\]\(([^)]+)\)',(OUTPUT/filename).read_text(encoding='utf-8')):
            target=link.split('#',1)[0]
            if not target or '://' in target:continue
            path=(OUTPUT/target).resolve();assert path.is_relative_to(ROOT) and path.is_file(),target
    v=json.loads((OUTPUT/'verification.json').read_text())
    assert v['baselineVerification']['exitCode']==0 and v['baselineTestsRetained']==454
    assert not v['engineTestsRerun'] and not v['phase3fExecuted'] and v['proposalStatus']=='READY_FOR_OWNER_DECISION'
    print('Phase3F proposal verified; accepted 454-test source baseline unchanged; construction pending owner decision')
if __name__=='__main__':main()
