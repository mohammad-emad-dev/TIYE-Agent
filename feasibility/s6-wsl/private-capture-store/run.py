"""Private storage qualification: default offline; explicit Windows capture only."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import time
import unittest
import uuid

from publication import select_public, canonical

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-private-capture-store'
SUBJECT = ROOT / 'output/s6-capture-access-review/review.json'
LIMITS = {'nativeAdmissionGranted': False, 'nativeProviderRuns': 0, 'phase1': 'HOLD',
          'P1': 'OPEN', 'P2': 'OPEN', 'alternateTokenTested': False,
          'hostileFilesystemQualified': False, 'launcherIntegrated': False}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(SOURCE.glob('*.py'))}


def artifact_hashes(folder):
    return {path.relative_to(folder).as_posix(): sha(path) for path in sorted(folder.rglob('*'))
            if path.is_file() and path != folder / 'evidence.json'}


def storage_test_result():
    import test_store
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(test_store.StorageTests)
    log, started = io.StringIO(), time.monotonic()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    if not tests.wasSuccessful():
        print(log.getvalue())
        raise RuntimeError('storage-qualification-failed-private-evidence-retained')
    return {'log': log.getvalue(), 'selected': select_public(test_store.OBSERVATIONS),
            'testCount': tests.testsRun, 'elapsedSeconds': time.monotonic() - started}


def capture(destination):
    if os.name != 'nt':
        raise OSError('Windows required')
    frozen = sources()
    destination.mkdir(parents=True, exist_ok=True)
    with (destination / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump({'sourceSha256': frozen, 'limits': LIMITS,
                   'subjectAccessReviewSha256': sha(SUBJECT)}, stream, indent=2)
    measured = storage_test_result()
    if frozen != sources():
        raise ValueError('sources-changed-during-capture')
    publish_result(destination, frozen, measured)
    print(measured['log'])
    print('Selected verdicts exported; raw canaries/retention remain private unless explicitly deleted')
    return 0


def publish_result(destination, frozen, measured):
    (destination / 'tests.log').write_text(measured['log'], encoding='utf-8')
    (destination / 'observations.json').write_text(json.dumps(measured['selected'], indent=2), encoding='utf-8')
    evidence = {'projectDate': '2026-10-18', 'sourceSha256': frozen, 'limits': LIMITS,
                'testCount': measured['testCount'], 'testsSuccessful': True,
                'elapsedSeconds': measured['elapsedSeconds'],
                'artifactSha256': artifact_hashes(destination)}
    with (destination / 'evidence.json').open('x', encoding='utf-8') as stream:
        json.dump(evidence, stream, indent=2)


def check():
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    entry = json.loads((OUT / 'input.json').read_text(encoding='utf-8'))
    if (evidence['sourceSha256'] != sources() or entry['sourceSha256'] != sources()
            or entry['subjectAccessReviewSha256'] != sha(SUBJECT)
            or evidence['testCount'] != 8 or evidence['testsSuccessful'] is not True
            or any(canonical(record['limits']) != canonical(LIMITS) for record in (entry, evidence))):
        raise ValueError('source-count-or-admission-mismatch')
    if evidence['artifactSha256'] != artifact_hashes(OUT):
        raise ValueError('private-store-artifact-mismatch')
    select_public(json.loads((OUT / 'observations.json').read_text(encoding='utf-8')))
    print('Saved private storage: 8 Windows cases; P1/P2 OPEN; no alternate-token or native admission')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--develop', action='store_true')
    parser.add_argument('--native', action='store_true')
    arguments = parser.parse_args()
    if arguments.native:
        parser.error('native-execution-disabled')
    if arguments.capture and arguments.develop:
        parser.error('choose one destination')
    if arguments.capture and not all((OUT / name).is_file() for name in ('README.md', 'review.json')):
        parser.error('report-and-review-required')
    destination = ROOT / '.git/tiye-private-store-development' / uuid.uuid4().hex if arguments.develop else OUT
    raise SystemExit(capture(destination) if arguments.capture or arguments.develop else check())
