"""Collect bounded, present-day metadata; existing launcher captures stay untouched."""
import datetime
import json
import os
import subprocess
from pathlib import Path

import check


def windows_targets():
    public = [check.PRIOR] + sorted(path for path in check.PRIOR.rglob('*') if path.is_file())
    return [{'label': path.relative_to(check.ROOT).as_posix(), 'path': str(path)} for path in public] + [
        {'label': 'private-delegation-root', 'path': str(check.ROOT / '.git/tiye-delegates')},
        {'label': 'private-development-root',
         'path': str(check.ROOT / '.git/tiye-consolidated-launcher-development')}]


def collect_windows(system):
    script = check.SOURCE / 'windows-acl.ps1'
    completed = subprocess.run([str(system / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        '-NoLogo', '-NoProfile', '-NonInteractive', '-File', str(script)],
        input=json.dumps({'targets': windows_targets()}), encoding='utf-8',
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45, check=True)
    if completed.stderr:
        raise ValueError('windows-probe-diagnostic-output')
    return json.loads(completed.stdout.lstrip('\ufeff'))


def collect_linux(system):
    observations = json.loads((check.PRIOR / 'observations.json').read_text(encoding='utf-8'))
    roots = sorted(record['runtime']['linuxRoot'] for record in observations if 'runtime' in record)
    script = (check.SOURCE / 'linux-metadata.py').read_text(encoding='utf-8')
    completed = subprocess.run([str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp',
        '--exec', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
        '/usr/bin/python3', '-I', '-S', '-B', '-c', script],
        input=json.dumps(roots), encoding='utf-8', stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=30, check=True)
    if completed.stderr:
        raise ValueError('linux-probe-diagnostic-output')
    return json.loads(completed.stdout)


def capture():
    if os.name != 'nt':
        raise OSError('Windows required')
    destination = check.OUT / 'measurements.json'
    if destination.exists():
        raise FileExistsError('review-measurements-already-exist')
    subject_before = check.inventory(check.PRIOR)
    system = Path(os.environ['SystemRoot'])
    observed = {'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'limits': check.LIMITS, 'windowsDacl': collect_windows(system),
        'linuxMetadata': collect_linux(system)}
    if subject_before != check.inventory(check.PRIOR):
        raise ValueError('subject-mutated-during-review')
    check.OUT.mkdir(parents=True, exist_ok=True)
    with destination.open('x', encoding='utf-8') as stream:
        json.dump(observed, stream, indent=2)
    print('Captured present-day metadata; no provider execution or credential reads')


if __name__ == '__main__':
    capture()
