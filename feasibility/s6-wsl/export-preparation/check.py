"""Verify saved hashes offline, or run owned Linux fixtures with --develop."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-export-preparation'
REQUEST = ROOT / 'feasibility/s6-wsl/export-grant/request.py'
ARTIFACTS = {'README.md', 'review.json', 'verification.json'}
REFERENCES = {'output/s6-export-grant/evidence.json',
              'output/s6-export-grant/REQUEST-CONTRACT.md',
              'output/s6-recovery-decision/DECISION-CONTRACT.md'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {path.relative_to(ROOT).as_posix(): digest(path)
            for path in sorted([*SOURCE.glob('*.py'), REQUEST])}


def save(path, record):
    path.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')


def expected(mode):
    return {'scope': 'synthetic-descriptor-preparation-tests-v1', 'tests': 14,
            'successful': True, 'exportExecutionAllowed': False,
            'nativeExecutionAllowed': False, 'commands': [], 'optimization': mode}


def validate(record, mode):
    if json.dumps(record, sort_keys=True) != json.dumps(expected(mode), sort_keys=True):
        raise ValueError('preparation-verdict-drift-or-promotion')


def develop():
    if sys.platform != 'win32':
        raise RuntimeError('development-driver-requires-Windows-with-Ubuntu-WSL')
    bound = sources()
    windows_root = ROOT.as_posix()
    linux_root = '/mnt/' + windows_root[0].lower() + windows_root[2:]
    bootstrap = (
        'import hashlib,json,os,sys\nfrom pathlib import Path\n'
        'if os.geteuid()==0: raise RuntimeError("non-root-fixture-required")\n'
        f'root=Path({linux_root!r})\n'
        f'bound={bound!r}\n'
        'def hashes():\n return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in bound}\n'
        'if hashes()!=bound: raise RuntimeError("linux-source-drift-before")\n'
        'sys.path[:0]=[str(root/"feasibility/s6-wsl/export-preparation"),'
        'str(root/"feasibility/s6-wsl/export-grant")]\n'
        'from test_prepare import run\nresult=run()\n'
        'if hashes()!=bound: raise RuntimeError("linux-source-drift-after")\n'
        'result["optimization"]=sys.flags.optimize\nprint(json.dumps(result,sort_keys=True))\n')
    arguments = ['wsl.exe', '-d', 'Ubuntu', '--exec', 'python3', '-I', '-S', '-B']
    if sys.flags.optimize:
        arguments.append('-O')
    arguments.append('-')
    capture = subprocess.run(arguments, input=bootstrap.encode(), stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, timeout=60)
    local = ROOT / '.git/tiye-export-preparation' / uuid.uuid4().hex
    local.mkdir(parents=True)
    (local / 'stdout.bin').write_bytes(capture.stdout)
    (local / 'stderr.bin').write_bytes(capture.stderr)
    if capture.returncode:
        raise RuntimeError('Linux fixture failed; private diagnostics: ' + str(local))
    if len(capture.stdout) > 4096 or capture.stderr:
        raise ValueError('unexpected-linux-fixture-output')
    record = json.loads(capture.stdout)
    validate(record, sys.flags.optimize)
    if sources() != bound:
        raise ValueError('host-source-drift')
    save(local / 'report.json', {'sources': bound, 'verdict': record})
    print('Fourteen Linux descriptor preparation tests passed: ' + str(local / 'report.json'))


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != sources() or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('preparation-source-or-scope-drift')
    for key, names, base in (('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)):
        if set(evidence[key]) != names or any(digest(base / name) != sha
                                             for name, sha in evidence[key].items()):
            raise ValueError('preparation-artifact-drift')
    record = json.loads((OUT / 'verification.json').read_bytes())
    if set(record) != {'normal', 'optimized'}:
        raise ValueError('preparation-verification-schema')
    validate(record['normal'], 0)
    validate(record['optimized'], 1)
    print('Saved descriptor preparation evidence verified; export execution disabled')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    develop() if args.develop else verify()
