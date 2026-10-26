"""Check a pending construction proposal and its unchanged accepted baseline."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def baseline_bytes(name):
    return subprocess.run(['git', 'show', '2aa8abf:' + name], cwd=ROOT,
                          capture_output=True, check=True).stdout

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    assert evidence['approvalStatus'] == 'PENDING' and not evidence['constructionAuthorized']
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    baseline_name = 'output/phase2d-exit/evidence.json'
    raw = (ROOT / baseline_name).read_bytes()
    assert raw == baseline_bytes(baseline_name)
    assert digest(raw) == evidence['baselineManifestSha256']
    baseline = json.loads(raw)
    for name, expected in baseline['sources'].items():
        assert digest((ROOT / name).read_bytes()) == expected, 'accepted source changed: ' + name
    package = ROOT / 'packages/core'
    inventory = {path.relative_to(ROOT).as_posix() for path in package.rglob('*') if path.is_file()
                 and not {'node_modules', 'dist'} & set(path.relative_to(package).parts)}
    assert inventory == {name for name in baseline['sources'] if name.startswith('packages/core/')}
    for name, expected in baseline['artifacts'].items():
        assert digest((ROOT / 'output/phase2d-exit' / name).read_bytes()) == expected, 'accepted artifact changed: ' + name
    for name in ['AMENDMENT.md', 'CONTRACT.md', 'README.md']:
        source = (OUTPUT / name).read_text(encoding='utf-8')
        for target in re.findall(r'\]\(([^)]+)\)', source):
            target = target.split('#', 1)[0]
            if not target or '://' in target:
                continue
            destination = (OUTPUT / target).resolve()
            assert destination.is_relative_to(ROOT) and destination.is_file(), (name, target)
    verification = json.loads((OUTPUT / 'verification.json').read_text(encoding='utf-8'))
    assert verification['baselineVerification']['exitCode'] == 0
    assert verification['phase2eEngineExecuted'] is False
    assert verification['proposalStatus'] == 'READY_FOR_OWNER_DECISION'
    assert verification['baselineCommit'] == '2aa8abf'
    print('Phase 2E proposal consistent; accepted engine unchanged; owner approval pending; integration HOLD')

if __name__ == '__main__':
    main()
