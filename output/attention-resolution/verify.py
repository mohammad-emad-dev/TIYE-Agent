"""Verify source/evidence consistency without running any synthetic action."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_bytes(commit, name):
    return subprocess.run(['git', 'show', commit + ':' + name], cwd=ROOT,
                          capture_output=True, check=True).stdout

def main():
    evidence = json.loads((OUTPUT / 'evidence.json').read_text(encoding='utf-8'))
    for name, expected in evidence['sources'].items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    for name, expected in evidence['artifacts'].items():
        assert digest((OUTPUT / name).read_bytes()) == expected, name
    package = ROOT / 'packages/core'
    inventory = {p.relative_to(ROOT).as_posix() for p in package.rglob('*') if p.is_file()
                 and not {'node_modules', 'dist'} & set(p.relative_to(package).parts)}
    assert inventory == {name for name in evidence['sources'] if name.startswith('packages/core/')}
    verification = json.loads((OUTPUT / 'verification.json').read_text(encoding='utf-8'))
    preflight = json.loads((OUTPUT / 'preflight.json').read_text(encoding='utf-8'))
    assert evidence['sources'] == verification['sources'] == preflight['sources']
    assert verification['preflightSha256'] == digest((OUTPUT / 'preflight.json').read_bytes())
    assert preflight['planSha256'] == digest((OUTPUT / 'TEST-PLAN.md').read_bytes())
    assert [step['step'] for step in verification['steps']] == ['build', 'boundary', 'tests']
    assert all(step['exitCode'] == 0 for step in verification['steps'])
    assert verification['testCounts'] == {'tests': 34, 'pass': 34, 'fail': 0, 'cancelled': 0, 'skipped': 0}
    for folder, commit in [('phase1a-core', '4f237b1'), ('phase1b-core', '11e4905')]:
        name = 'output/' + folder + '/evidence.json'
        raw = (ROOT / name).read_bytes()
        assert raw == git_bytes(commit, name), 'historical manifest changed'
        historical = json.loads(raw)
        for source, expected in historical['sources'].items():
            data = git_bytes(commit, source)
            if folder == 'phase1b-core' and source == 'README.md':
                # That captured Windows checkout preceded the byte-preserving attribute.
                assert b'\r\n' not in data
                data = data.replace(b'\n', b'\r\n')
            assert digest(data) == expected, 'historical source: ' + source
        for artifact, expected in historical['artifacts'].items():
            assert digest((ROOT / 'output' / folder / artifact).read_bytes()) == expected, 'historical artifact: ' + artifact
    print('Attention resolution evidence consistent: 34 passing tests; historical evidence preserved; integration HOLD')

if __name__ == '__main__':
    main()
