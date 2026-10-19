"""Offline source/evidence checker; --test runs only nonexecuting policy tests."""
import argparse
import hashlib
import json
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-deadline-recovery'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-charged-wsl/evidence.json', 'output/s6-charged-wsl/observations.json',
              'output/s6-native-contract/contract.json'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = list(SOURCE.glob('*.py')) + [SOURCE.parent / 'native-preflight/policy.py']
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}


def validate(evidence, observations):
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['nativeExecutionAllowed'] is not False or evidence['sources'] != sources()):
        raise ValueError('source-or-admission-drift')
    for key, expected, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)]:
        if set(evidence[key]) != expected:
            raise ValueError('artifact-or-reference-set')
        for name, digest in evidence[key].items():
            if sha(base / name) != digest:
                raise ValueError('artifact-or-reference-drift')
    expected = {'scope': 'nonexecuting-policy-tests-with-saved-witness-input',
                'coordinatorTests': 12, 'publicationTests': 2,
                'normalPassed': True, 'optimizedPassed': True,
                'liveCrossOsScheduleQualified': False, 'durableRecoveryQualified': False,
                'nativeExecutionAllowed': False}
    if (type(observations) is not dict or set(observations) != set(expected)
            or any(type(observations[key]) is not type(value) or observations[key] != value
                   for key, value in expected.items())):
        raise ValueError('observation-or-scope-promotion')


def check():
    validate(json.loads((OUT / 'evidence.json').read_text()),
             json.loads((OUT / 'observations.json').read_text()))
    print('Saved deadline/recovery policy evidence verified; no live/native qualification')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--test', action='store_true')
    args = parser.parse_args()
    if args.test:
        suite = unittest.defaultTestLoader.discover(str(SOURCE), pattern='test_*.py')
        report = unittest.TextTestRunner(verbosity=2).run(suite)
        raise SystemExit(0 if report.wasSuccessful() else 1)
    check()
