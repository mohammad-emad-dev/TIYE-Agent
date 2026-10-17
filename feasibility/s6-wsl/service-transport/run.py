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
OUT = ROOT / 'output/s6-service-transport'
FILES = ('service.py', 'transport.py', 'protocol_peer.py', 'owned.py', 'peer.py', 'witness.py', 'test_linux.py')
CASES = {'valid-exit', 'valid-crash', 'foreign-exit'}
BOOTSTRAP = '''import base64,hashlib,json,os,platform,subprocess,sys,tempfile
from pathlib import Path
if os.getuid()!=1000: raise ValueError('expected-non-root-uid1000')
incoming=sys.stdin.buffer.read(65537)
if len(incoming)>65536: raise ValueError('bundle-budget')
bundle=json.loads(incoming)
if set(bundle['files'])!={'test_linux.py', 'witness.py', 'peer.py', 'owned.py', 'service.py', 'transport.py', 'protocol_peer.py'}: raise ValueError('bundle-files')
os.umask(0o077)
root=Path(tempfile.mkdtemp(prefix='tiye-service-transport-',dir='/tmp'))
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
    from validation import validate_observation
    return validate_observation(observation)


def check():
    for name in FILES:
        compile((SOURCE / name).read_text(encoding='utf-8'), name, 'exec')
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if sources() != evidence['sourceSha256'] or evidence['sourcesUnchanged'] is not True:
        raise ValueError('service-transport-source-changed')
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('service-transport-artifact-changed:' + name)
    if evidence['hostExitCode'] != 0 or evidence['timedOut'] is not False:
        raise ValueError('service-transport-host-incomplete')
    observation = json.loads((OUT / 'wsl.stdout.bin').read_bytes())
    entry = json.loads((OUT / 'input.json').read_text(encoding='utf-8'))
    if (observation['nonce'] != entry['nonce'] or evidence['nativeProviderRuns'] != 0
            or evidence['nativeAdmissionGranted'] is not False or evidence['phase1'] != 'HOLD'):
        raise ValueError('linux-entry-or-admission-mismatch')
    validate(observation)
    if (OUT / 'wsl.stderr.bin').read_bytes():
        raise ValueError('unexpected-wsl-stderr')
    print('Saved managed mock transport: 3 controlled cases; no provider run; native admission remains disabled')
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
            'fixtureProcessTtlSeconds': 15, 'nativeProviderRuns': 0}, stream, indent=2)
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
    destination = ROOT / '.git/tiye-service-transport-development' / uuid.uuid4().hex if arguments.develop else OUT
    raise SystemExit(capture(destination) if arguments.capture or arguments.develop else check())
