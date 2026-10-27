"""Pin reviewed source before execution and retain actual incremental streams."""
import hashlib,json,re,subprocess,time,uuid
from pathlib import Path
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parents[2]
OUTPUT=Path(__file__).resolve().parent
PACKAGE=ROOT/'packages/core'

def digest(data):return hashlib.sha256(data).hexdigest()
def write(path,value):path.write_bytes((json.dumps(value,indent=2)+'\n').encode('utf-8'))
def files():
    result={}
    for folder in ['core','mock-team','api-adapter','api-loop']:
        package=ROOT/'packages'/folder
        for path in sorted(package.rglob('*')):
            if path.is_file() and not {'node_modules','dist'} & set(path.relative_to(package).parts):
                result[path.relative_to(ROOT).as_posix()]=digest(path.read_bytes())
    for name in ['README.md','architecture/TIYE-Agent-Architecture.md']:
        result[name]=digest((ROOT/name).read_bytes())
    for phase in ['phase2b','phase2c','phase2d','phase2e','phase2f','phase3a','phase3b']:
        for filename in ['README.md','approval.json']:
            name='output/'+phase+'-approval/'+filename
            result[name]=digest((ROOT/name).read_bytes())
    return result
def compiled():
    return {path.relative_to(ROOT).as_posix():digest(path.read_bytes())
        for folder in ['core','api-adapter','api-loop'] for path in sorted((ROOT/'packages'/folder/'dist').glob('*')) if path.is_file()}

def main():
    previous=json.loads((ROOT/'output/phase1a-core/verification.json').read_text())
    for name,expected in previous['dependencyFiles'].items():
        assert digest((PACKAGE/name).read_bytes())==expected,name
    runtime=json.loads(subprocess.run(['node','-p','JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,modules:process.versions.modules})'],
        cwd=PACKAGE,capture_output=True,check=True,timeout=10).stdout)
    assert runtime=={'node':'v26.7.0','platform':'win32','arch':'x64','modules':'147'}
    local=ROOT/'.git/tiye-phase3b-loop'/str(uuid.uuid4());local.mkdir(parents=True)
    preflight={'scope':'internal-phase3b-read-only-loop','reviewedAtUtc':datetime.now(timezone.utc).isoformat(),
        'parentSourceReview':'accepted-for-fixed-scripted-adapter-and-retained-baseline-tests',
        'sources':files(),'compiled':compiled(),'runtime':runtime,'dependencyFiles':previous['dependencyFiles'],
        'planSha256':digest((OUTPUT/'TEST-PLAN.md').read_bytes()),'wholeSuiteTimeoutSeconds':780}
    write(local/'preflight.json',preflight);write(OUTPUT/'preflight.json',preflight)
    commands=[('build',['node','node_modules/typescript/bin/tsc','-p','tsconfig.json']),
        ('build-adapter',['node','node_modules/typescript/bin/tsc','-p','../api-adapter/tsconfig.json']),
        ('build-loop',['node','node_modules/typescript/bin/tsc','-p','../api-loop/tsconfig.json']),
        ('boundary',['node','scripts/check-boundary.cjs']),
        ('mock-boundary',['node','../mock-team/check-boundary.cjs']),
        ('adapter-boundary',['node','../api-adapter/scripts/check-boundary.cjs']),
        ('loop-boundary',['node','../api-loop/scripts/check-boundary.cjs']),
        ('tests',['node','--test','--test-reporter=tap','test/*.test.cjs','../mock-team/test/*.test.cjs','../api-adapter/test/*.test.cjs','../api-loop/test/*.test.cjs'])]
    steps=[]
    for label,args in commands:
        stdout_path,stderr_path=local/(label+'.stdout'),local/(label+'.stderr')
        budget=780 if label=='tests' else 60;started=time.monotonic()
        with stdout_path.open('wb') as stdout,stderr_path.open('wb') as stderr:
            try:code=subprocess.run(args,cwd=PACKAGE,stdout=stdout,stderr=stderr,timeout=budget).returncode
            except subprocess.TimeoutExpired:code=124
        elapsed=time.monotonic()-started
        if elapsed>budget:code=124
        stdout,stderr=stdout_path.read_bytes(),stderr_path.read_bytes()
        steps.append({'step':label,'exitCode':code,'durationSeconds':round(elapsed,3),
            'stdoutSha256':digest(stdout),'stderrSha256':digest(stderr)})
        print(label,code,flush=True)
        if code:
            print(stdout.decode('utf-8',errors='replace')[-16000:]);print(stderr.decode('utf-8',errors='replace')[-3000:]);break
    assert preflight['sources']==files(),'source changed during execution'
    assert preflight['compiled']==compiled(),'rebuild differs from reviewed bytes'
    verification={'scope':preflight['scope'],'sources':files(),'steps':steps,
        'preflightSha256':digest((OUTPUT/'preflight.json').read_bytes())}
    if (local/'tests.stdout').exists():
        tap=(local/'tests.stdout').read_text(encoding='utf-8')
        verification['testCounts']={key:int(value) for key,value in re.findall(r'^# (tests|pass|fail|cancelled|skipped) (\d+)\s*$',tap,re.M)}
    write(local/'verification.json',verification);write(OUTPUT/'verification.json',verification)
    assert len(steps)==8 and all(step['exitCode']==0 for step in steps),'qualification failed'
    print(verification['testCounts'])

if __name__=='__main__':main()
