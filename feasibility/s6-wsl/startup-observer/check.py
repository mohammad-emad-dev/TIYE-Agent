"""Offline startup-observer evidence validation; no native admission route."""
import hashlib
import json
from pathlib import Path

from run_windows import validate

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-startup-observer'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-native-inventory/evidence.json', 'output/s6-native-inventory/profile.json',
              'output/s6-scheduled-wsl/evidence.json', 'output/s6-native-contract/contract.json'}
DEPENDENCIES = ['native-inventory/linux.py', 'native-inventory/inspect_windows.py',
                'resource-watchdog/composition.py', 'resource-launcher/resources.py',
                'native-preflight/policy.py', 'stream-writer/writer.py',
                'private-capture-store/store.py', 'private-capture-store/winacl.py']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py')) + [SOURCE.parent / name for name in DEPENDENCIES]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def validate_evidence(evidence):
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != sources() or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('source-or-admission-drift')
    for key, names, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)]:
        if set(evidence[key]) != names:
            raise ValueError('artifact-or-reference-set')
        for name, digest in evidence[key].items():
            if sha(base / name) != digest:
                raise ValueError('artifact-or-reference-drift')


def check():
    validate_evidence(json.loads((OUT / 'evidence.json').read_text()))
    validate(json.loads((OUT / 'observations.json').read_text()))
    print('Saved synthetic startup observer verified; native admission remains disabled')


if __name__ == '__main__':
    check()
