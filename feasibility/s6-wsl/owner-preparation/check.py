"""Verify saved evidence or run a fresh bounded delegated Linux fixture."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-owner-preparation'
DEPENDENCIES = ['export-preparation/prepare.py', 'export-grant/request.py']
ARTIFACTS = {'README.md', 'PROTOCOL.md', 'review.json', 'verification.json'}
REFERENCES = {'output/s6-export-preparation/evidence.json',
              'output/s6-export-grant/REQUEST-CONTRACT.md',
              'output/s6-custody-recovery/evidence.json'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = [*SOURCE.glob('*.py'), *(SOURCE.parent / name for name in DEPENDENCIES)]
    return {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(paths)}


def save(path, record):
    path.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')


def expected(mode):
    return {'scope': 'synthetic-live-owner-preparation-tests-v1', 'tests': 15,
            'successful': True, 'exportExecutionAllowed': False,
            'nativeExecutionAllowed': False, 'commands': [], 'optimization': mode}


def validate(record, mode):
    if json.dumps(record, sort_keys=True) != json.dumps(expected(mode), sort_keys=True):
        raise ValueError('owner-preparation-verdict-drift-or-promotion')


def bootstrap(bound):
    windows_root = ROOT.as_posix()
    linux_root = '/mnt/' + windows_root[0].lower() + windows_root[2:]
    return (
        'import hashlib,json,os,sys\nfrom pathlib import Path\n'
        'if os.geteuid()!=1000: raise RuntimeError("uid1000-fixture-required")\n'
        f'root=Path({linux_root!r})\nbound={bound!r}\n'
        'def hashes():\n return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in bound}\n'
        'if hashes()!=bound: raise RuntimeError("linux-source-drift-before")\n'
        'sys.path[:0]=[str(root/"feasibility/s6-wsl"/name) for name in '
        '["owner-preparation","export-preparation","export-grant"]]\n'
        'from test_owner import run\nverdict=run()\n'
        'if hashes()!=bound: raise RuntimeError("linux-source-drift-after")\n'
        'verdict["optimization"]=sys.flags.optimize\nprint(json.dumps(verdict,sort_keys=True))\n')


def develop():
    if sys.platform != 'win32':
        raise RuntimeError('development-driver-requires-Windows-with-Ubuntu-WSL')
    bound = sources()
    unit = 'tiye-owner-preparation-' + uuid.uuid4().hex + '.service'
    arguments = ['wsl.exe', '-d', 'Ubuntu', '--exec', '/usr/bin/env', '-i',
        'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', 'XDG_RUNTIME_DIR=/run/user/1000',
        'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus', '/usr/bin/systemd-run',
        '--user', '--quiet', '--wait', '--collect', '--pipe', '--service-type=exec', '--unit=' + unit,
        '-pDelegate=yes', '-pRuntimeMaxSec=45s', '-pTimeoutStopSec=2s',
        '-pKillMode=control-group', '-pRestart=no', '-pUMask=0077',
        '/usr/bin/python3', '-I', '-S', '-B']
    if sys.flags.optimize:
        arguments.append('-O')
    capture = subprocess.run(arguments + ['-'], input=bootstrap(bound).encode(),
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=55)
    local = ROOT / '.git/tiye-owner-preparation' / uuid.uuid4().hex
    local.mkdir(parents=True)
    (local / 'stdout.bin').write_bytes(capture.stdout)
    (local / 'stderr.bin').write_bytes(capture.stderr)
    if capture.returncode:
        raise RuntimeError('Linux owner fixture failed; private diagnostics: ' + str(local))
    if len(capture.stdout) > 4096 or capture.stderr:
        raise ValueError('unexpected-owner-fixture-output')
    verdict = json.loads(capture.stdout)
    validate(verdict, sys.flags.optimize)
    if sources() != bound:
        raise ValueError('host-source-drift')
    save(local / 'report.json', {'sources': bound, 'verdict': verdict})
    print('Fifteen live Linux owner preparation tests passed: ' + str(local / 'report.json'))


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != sources() or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('owner-preparation-source-or-scope-drift')
    for key, names, base in (('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)):
        if set(evidence[key]) != names or any(digest(base / name) != sha
                                             for name, sha in evidence[key].items()):
            raise ValueError('owner-preparation-artifact-drift')
    verdicts = json.loads((OUT / 'verification.json').read_bytes())
    if set(verdicts) != {'normal', 'optimized'}:
        raise ValueError('owner-preparation-verification-schema')
    validate(verdicts['normal'], 0)
    validate(verdicts['optimized'], 1)
    print('Saved live owner preparation evidence verified; export execution disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    develop() if args.develop else verify()
