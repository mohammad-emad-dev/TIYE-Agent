"""Verify the pending Phase3B proposal against its unchanged accepted baseline."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    assert evidence['approvalStatus'] == 'PENDING' and not evidence['constructionAuthorized']
    assert evidence['baselineCommit'] == '11eee3b'
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    name = 'output/phase3a-exit/evidence.json'
    raw = (ROOT / name).read_bytes()
    accepted = subprocess.run(['git','show','11eee3b:' + name],cwd=ROOT,capture_output=True,check=True).stdout
    assert raw == accepted and digest(raw) == evidence['baselineManifestSha256']
    baseline = json.loads(raw)
    for name, expected in baseline['sources'].items():
        assert digest((ROOT / name).read_bytes()) == expected, 'accepted source changed: ' + name
    for name, expected in baseline['artifacts'].items():
        assert digest((ROOT / 'output/phase3a-exit' / name).read_bytes()) == expected, 'accepted artifact changed: ' + name
    inventory = set()
    for folder in ['core','mock-team','api-adapter']:
        package = ROOT / 'packages' / folder
        inventory.update(p.relative_to(ROOT).as_posix() for p in package.rglob('*') if p.is_file()
                         and not {'node_modules','dist'} & set(p.relative_to(package).parts))
    assert inventory == {name for name in baseline['sources'] if name.startswith('packages/')}
    assert not (ROOT / 'packages/api-loop').exists(), 'proposal cannot introduce runtime source'
    for name in ['README.md','AMENDMENT.md','CONTRACT.md']:
        for target in re.findall(r'\]\(([^)]+)\)', (OUTPUT / name).read_text(encoding='utf-8')):
            target = target.split('#',1)[0]
            if not target or '://' in target:
                continue
            path = (OUTPUT / target).resolve()
            assert path.is_relative_to(ROOT) and path.is_file(), (name,target)
    verification = json.loads((OUTPUT / 'verification.json').read_text(encoding='utf-8'))
    assert verification['baselineVerification']['exitCode'] == 0
    assert verification['proposalStatus'] == 'READY_FOR_OWNER_DECISION'
    assert verification['phase3bLoopExecuted'] is False
    assert verification['baselineTestsRetained'] == 273 and verification['engineTestsRerun'] is False
    assert evidence['nativeProviderIntegration'] == 'HOLD' and not evidence['releaseAllowed']
    print('Phase3B proposal consistent; accepted 273-test baseline unchanged; construction pending owner decision')

if __name__ == '__main__':
    main()
