"""Offline by default; explicit captures run fixed Linux process fixtures only."""
import argparse
import base64
import hashlib
import json
import os
import platform
import subprocess
import time
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-linux-owner'
FILES = ('owner.py', 'peer.py', 'supervisor.py', 'test_linux.py')
CASES = {'normal', 'adopted', 'escalate', 'mismatch'}
BOOTSTRAP = '''import base64,hashlib,json,os,platform,subprocess,sys,tempfile
from pathlib import Path
if os.getuid()!=1000: raise ValueError('expected-non-root-uid1000')
incoming=sys.stdin.buffer.read(65537)
if len(incoming)>65536: raise ValueError('bundle-budget')
bundle=json.loads(incoming)
if set(bundle['files'])!={'owner.py','peer.py','supervisor.py','test_linux.py'}: raise ValueError('bundle-files')
os.umask(0o077)
root=Path(tempfile.mkdtemp(prefix='tiye-linux-owner-',dir='/tmp'))
(root/'owner.json').write_text(json.dumps({'nonce':bundle['nonce']}))
for name,encoded in bundle['files'].items():
 raw=base64.b64decode(encoded,validate=True)
 if hashlib.sha256(raw).hexdigest()!=bundle['sha256'][name]: raise ValueError('bundle-hash')
 with (root/name).open('xb') as stream: stream.write(raw)
run=subprocess.run([sys.executable,'-I','-S','-B',str(root/'test_linux.py')],
 stdin=subprocess.DEVNULL,capture_output=True,timeout=25,
 env={'PATH':'/usr/bin:/bin','LC_ALL':'C.UTF-8'})
print(json.dumps({'runtimeRoot':str(root),'nonce':bundle['nonce'],'uid':os.getuid(),
 'linux':platform.platform(),'python':platform.python_version(),'testExitCode':run.returncode,
 'stdoutBase64':base64.b64encode(run.stdout).decode('ascii'),
 'stderrBase64':base64.b64encode(run.stderr).decode('ascii')}))
sys.exit(0 if run.returncode==0 else 1)
'''


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(SOURCE.glob('*.py'))}


def validate(observation):
    if (observation['uid'] != 1000 or observation['testExitCode'] != 0
            or base64.b64decode(observation['stderrBase64'], validate=True)):
        raise ValueError('linux-fixture-exit-or-uid')
    tests = json.loads(base64.b64decode(observation['stdoutBase64'], validate=True))
    if tests['testCount'] != 4 or tests['passed'] is not True:
        raise ValueError('linux-tests-incomplete')
    cases = {record['case']: record for record in tests['observations']}
    if len(tests['observations']) != 4 or set(cases) != CASES:
        raise ValueError('linux-cases-missing')
    if any(record['unrelatedSentinelLive'] is not True for record in cases.values()):
        raise ValueError('sentinel-witness-missing')
    for mode, record in cases.items():
        result = record['result']
        after = result['after']
        if (result['observedEmpty'] is not True or after['liveCount'] != 0
                or after['rootExitCode'] != (0 if mode == 'normal' else 7)
                or any(row['exitCode'] is None for row in after['identities'])
                or result['nativeAdmissionGranted'] is not False or result['elapsedSeconds'] >= 5):
            raise ValueError('linux-exit-or-cleanup-witness-incomplete')
        expected_leaves = 0 if mode == 'normal' else 2 if mode == 'mismatch' else 1
        if len(record['leafIdentities']) != expected_leaves:
            raise ValueError('linux-leaf-witness-count')
    for mode in CASES - {'normal'}:
        if cases[mode]['leafIndependentlySignaledAndAbsent'] is not True:
            raise ValueError('adopted-child-witness-missing')
    if (cases['escalate']['result']['killSignals'] != 1
            or cases['normal']['result']['termSignals'] != 0
            or cases['mismatch']['result']['mismatch']['refused'] is not True):
        raise ValueError('linux-signal-outcome-incomplete')
    return tests


def check():
    for name in FILES:
        compile((SOURCE / name).read_text(encoding='utf-8'), name, 'exec')
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if sources() != evidence['sourceSha256'] or evidence['sourcesUnchanged'] is not True:
        raise ValueError('linux-owner-source-changed')
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('linux-owner-artifact-changed:' + name)
    if evidence['hostExitCode'] != 0 or evidence['timedOut'] is not False:
        raise ValueError('linux-owner-host-incomplete')
    observation = json.loads((OUT / 'wsl.stdout.bin').read_bytes())
    entry = json.loads((OUT / 'input.json').read_text(encoding='utf-8'))
    if (observation['nonce'] != entry['nonce'] or evidence['nativeProviderRuns'] != 0
            or evidence['nativeAdmissionGranted'] is not False or evidence['phase1'] != 'HOLD'):
        raise ValueError('linux-entry-or-admission-mismatch')
    validate(observation)
    if (OUT / 'wsl.stderr.bin').read_bytes():
        raise ValueError('unexpected-wsl-stderr')
    print('Saved Linux owner: 4 controlled cases; no provider run; native admission remains disabled')
    return 0


def capture(output):
    frozen = sources()
    for name in FILES:
        compile((SOURCE / name).read_text(encoding='utf-8'), name, 'exec')
    output.mkdir(parents=True, exist_ok=True)
    bundle = {'nonce': uuid.uuid4().hex,
        'files': {name: base64.b64encode((SOURCE / name).read_bytes()).decode('ascii') for name in FILES},
        'sha256': {name: sha(SOURCE / name) for name in FILES}}
    payload = json.dumps(bundle).encode('ascii')
    if len(payload) > 65536:
        raise ValueError('bundle-budget')
    system = Path(os.environ['SystemRoot'])
    command = [str(system / 'System32/wsl.exe'), '-d', 'Ubuntu', '--cd', '/tmp', '--exec',
        '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8',
        '/usr/bin/python3', '-I', '-S', '-B', '-c', BOOTSTRAP]
    with (output / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump({'sourceSha256': frozen, 'bundleSha256': hashlib.sha256(payload).hexdigest(),
            'nonce': bundle['nonce'], 'argv': command, 'hostDeadlineSeconds': 35,
            'fixtureProcessTtlSeconds': 10, 'nativeProviderRuns': 0}, stream, indent=2)
    env = {'SystemRoot': str(system), 'WINDIR': str(system), 'PATH': str(system / 'System32'),
           'TEMP': str(output), 'TMP': str(output)}
    started = time.monotonic()
    try:
        completed = subprocess.run(command, input=payload, env=env, capture_output=True, timeout=35)
        stdout, stderr = completed.stdout, completed.stderr
        exit_code, timed_out = completed.returncode, False
    except subprocess.TimeoutExpired as error:
        stdout, stderr = error.stdout or b'', error.stderr or b''
        exit_code, timed_out = None, True
    (output / 'wsl.stdout.bin').write_bytes(stdout)
    (output / 'wsl.stderr.bin').write_bytes(stderr)
    evidence = {'projectDate': '2026-10-17', 'windows': platform.platform(),
        'sourceSha256': frozen, 'sourcesUnchanged': sources() == frozen,
        'hostExitCode': exit_code, 'timedOut': timed_out,
        'elapsedSeconds': time.monotonic() - started, 'nativeProviderRuns': 0,
        'nativeAdmissionGranted': False, 'phase1': 'HOLD',
        'artifactSha256': {path.name: sha(path) for path in output.iterdir()
                           if path.is_file() and path.name != 'evidence.json'}}
    with (output / 'evidence.json').open('x', encoding='utf-8') as stream:
        json.dump(evidence, stream, indent=2)
    if exit_code != 0 or timed_out or stderr or not evidence['sourcesUnchanged']:
        print(json.dumps(evidence))
        return 1
    observation = json.loads(stdout)
    if observation['nonce'] != bundle['nonce']:
        raise ValueError('bootstrap-nonce-mismatch')
    tests = validate(observation)
    print(json.dumps({'tests': tests['testCount'], 'passed': tests['passed'],
        'cases': sorted(CASES), 'runtimeRoot': observation['runtimeRoot']}))
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--develop', action='store_true')
    arguments = parser.parse_args()
    if arguments.capture and arguments.develop:
        parser.error('choose one capture destination')
    if arguments.capture:
        for name in ['README.md', 'review.json']:
            if not (OUT / name).is_file():
                raise ValueError('capture-prerequisite-missing:' + name)
    destination = ROOT / '.git/tiye-linux-owner-development' / uuid.uuid4().hex if arguments.develop else OUT
    raise SystemExit(capture(destination) if arguments.capture or arguments.develop else check())
