"""Capture a reviewed preflight before tests; retain raw execution data locally."""
import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone
import uuid

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'packages/core'
OUTPUT = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def files():
    sources = {p.relative_to(ROOT).as_posix(): digest(p.read_bytes())
            for p in sorted(PACKAGE.rglob('*')) if p.is_file()
            and not {'node_modules', 'dist'} & set(p.relative_to(PACKAGE).parts)}
    for name in ['README.md', 'architecture/TIYE-Agent-Architecture.md']:
        sources[name] = digest((ROOT / name).read_bytes())
    return sources

def compiled():
    return {p.relative_to(PACKAGE).as_posix(): digest(p.read_bytes())
            for p in sorted((PACKAGE / 'dist').glob('*')) if p.is_file()}

def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')

def main():
    previous = json.loads((ROOT / 'output/phase1a-core/verification.json').read_text())
    for name, expected in previous['dependencyFiles'].items():
        assert digest((PACKAGE / name).read_bytes()) == expected, name
    local = ROOT / '.git/tiye-phase1b-core' / str(uuid.uuid4())
    local.mkdir(parents=True)
    preflight = {
        'scope': 'internal-phase1b-synthetic-only',
        'reviewedAtUtc': datetime.now(timezone.utc).isoformat(),
        'parentSourceReview': 'accepted-for-bounded-owned-synthetic-tests',
        'planSha256': digest((OUTPUT / 'TEST-PLAN.md').read_bytes()),
        'sources': files(),
        'compiled': compiled(),
        'dependencyFiles': previous['dependencyFiles'],
        'runtime': {'node': 'v26.7.0', 'platform': 'win32', 'arch': 'x64'},
    }
    write(local / 'preflight.json', preflight)
    write(OUTPUT / 'preflight.json', preflight)
    steps = []
    for label, arguments in [('build', ['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json']),
                              ('boundary', ['node', 'scripts/check-boundary.cjs']),
                              ('tests', ['node', '--test', '--test-reporter=tap', 'test/*.test.cjs'])]:
        result = subprocess.run(arguments, cwd=PACKAGE, capture_output=True, timeout=240)
        (local / (label + '.stdout')).write_bytes(result.stdout)
        (local / (label + '.stderr')).write_bytes(result.stderr)
        steps.append({'step': label, 'exitCode': result.returncode,
                      'stdoutSha256': digest(result.stdout), 'stderrSha256': digest(result.stderr)})
        print(label, result.returncode, flush=True)
        if result.returncode:
            print(result.stdout.decode('utf-8', errors='replace'))
            print(result.stderr.decode('utf-8', errors='replace'))
            break
    assert preflight['sources'] == files(), 'source changed during execution'
    assert preflight['compiled'] == compiled(), 'compiled files differ from reviewed preflight'
    verification = {'scope': preflight['scope'], 'sources': files(), 'steps': steps,
                    'preflightSha256': digest((OUTPUT / 'preflight.json').read_bytes())}
    write(local / 'verification.json', verification)
    write(OUTPUT / 'verification.json', verification)
    assert len(steps) == 3 and all(step['exitCode'] == 0 for step in steps), 'qualification failed'
    print((local / 'tests.stdout').read_text(encoding='utf-8')[-500:])

if __name__ == '__main__':
    main()
