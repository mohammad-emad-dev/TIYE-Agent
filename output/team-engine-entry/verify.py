"""Check the pending proposal and unchanged accepted core; execute no engine."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_bytes(name):
    return subprocess.run(['git', 'show', 'ab8da5f:' + name], cwd=ROOT,
                          capture_output=True, check=True).stdout

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    assert evidence['approval'] == 'PENDING' and evidence['engineImplemented'] is False
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    for name, expected in evidence['documents'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    baseline_name = 'output/task-registry/evidence.json'
    raw = (ROOT / baseline_name).read_bytes()
    assert raw == git_bytes(baseline_name), 'baseline manifest changed'
    baseline = json.loads(raw)
    package = ROOT / 'packages/core'
    current = {p.relative_to(ROOT).as_posix(): digest(p.read_bytes()) for p in package.rglob('*')
               if p.is_file() and not {'node_modules', 'dist'} & set(p.relative_to(package).parts)}
    expected = {name: value for name, value in baseline['sources'].items() if name.startswith('packages/core/')}
    assert current == expected, 'core changed during proposal-only task'
    for name, expected_hash in baseline['sources'].items():
        assert digest(git_bytes(name)) == expected_hash, 'historical source: ' + name
    for name, expected_hash in baseline['artifacts'].items():
        assert digest((ROOT / 'output/task-registry' / name).read_bytes()) == expected_hash, 'historical artifact: ' + name
    recorded = json.loads((ROOT / 'output/task-registry/verification.json').read_text(encoding='utf-8'))
    assert recorded['testCounts'] == {'tests': 45, 'pass': 45, 'fail': 0, 'cancelled': 0, 'skipped': 0}
    for document in OUTPUT.glob('*.md'):
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', document.read_text(encoding='utf-8')):
            assert (document.parent / target).resolve().is_file(), 'missing link: ' + target
    assert 'PROPOSAL; owner approval pending' in (OUTPUT / 'AMENDMENT.md').read_text(encoding='utf-8')
    print('Pending Phase 2A proposal consistent; accepted core unchanged; no engine execution or approval claimed')

if __name__ == '__main__':
    main()
