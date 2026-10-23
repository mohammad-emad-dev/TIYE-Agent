"""Check sealed Phase 1B evidence and immutable Phase 1A history; no execution."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    for name, expected in evidence['sources'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    package = ROOT / 'packages/core'
    actual_package_files = {p.relative_to(ROOT).as_posix() for p in package.rglob('*')
                            if p.is_file() and not {'node_modules', 'dist'} & set(p.relative_to(package).parts)}
    assert actual_package_files == {name for name in evidence['sources'] if name.startswith('packages/core/')}, 'package inventory drift'
    verification = json.loads((OUTPUT / 'verification.json').read_text(encoding='utf-8'))
    preflight = json.loads((OUTPUT / 'preflight.json').read_text(encoding='utf-8'))
    assert evidence['sources'] == verification['sources'] == preflight['sources']
    assert verification['preflightSha256'] == digest((OUTPUT / 'preflight.json').read_bytes())
    assert preflight['planSha256'] == digest((OUTPUT / 'TEST-PLAN.md').read_bytes())
    assert [step['step'] for step in verification['steps']] == ['build', 'boundary', 'tests']
    assert all(step['exitCode'] == 0 for step in verification['steps'])
    counts = verification['testCounts']
    assert counts['tests'] == counts['pass'] == 22
    assert counts['fail'] == counts['cancelled'] == counts['skipped'] == 0
    historical = json.loads((ROOT / 'output/phase1a-core/evidence.json').read_text(encoding='utf-8'))
    for name, expected in historical['sources'].items():
        result = subprocess.run(['git', 'show', '4f237b1:' + name], cwd=ROOT, capture_output=True, check=True)
        assert digest(result.stdout) == expected, 'historical source: ' + name
    for name, expected in historical['artifacts'].items():
        assert digest((ROOT / 'output/phase1a-core' / name).read_bytes()) == expected, 'historical artifact: ' + name
    print('Phase 1B evidence consistent: 22 passing tests; Phase 1A history preserved; integration HOLD')

if __name__ == '__main__':
    main()
