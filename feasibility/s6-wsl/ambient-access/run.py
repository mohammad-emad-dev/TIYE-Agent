"""Mock launcher on private storage; default is offline saved-verdict verification."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import unittest
import uuid

import contract
from publication import canonical, validate_records

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-ambient-access'
GROUPS = {'launcher': SOURCE / 'launcher',
          'storage': ROOT / 'feasibility/s6-wsl/private-capture-store', 'integration': SOURCE}
LIMITS = {'P1': 'OPEN', 'P2': 'OPEN', 'phase1': 'HOLD', 'nativeAdmissionGranted': False,
          'nativeProviderRuns': 0, 'alternateTokenTested': False,
          'linuxStorageQualified': False, 'hostileFilesystemQualified': False}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_manifest():
    return {group: {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(folder.glob('*.py'))}
            for group, folder in GROUPS.items()}


def fingerprint(manifest):
    return hashlib.sha256(canonical({'sources': manifest, 'contract': contract.manifest()}).encode('utf-8')).hexdigest()


def artifact_hashes(folder):
    return {path.relative_to(folder).as_posix(): sha(path) for path in sorted(folder.rglob('*'))
            if path.is_file() and path != folder / 'evidence.json'}


def admission_assessment(digest):
    return {'sourceSetSha256': digest, 'qualifiedMockCases': ['owned-ambient-probe'],
            'states': {'L1': 'PARTIAL', 'L2': 'PARTIAL', 'P1': 'OPEN', 'P2': 'OPEN', 'A1': 'BLOCKED'},
            'phase1': 'HOLD', 'nativeAdmissionGranted': False, 'historicalLedgersChanged': False}


def validate_assessment(assessment, digest):
    if canonical(assessment) != canonical(admission_assessment(digest)):
        raise ValueError('ambient-probe-cannot-promote-admission')


def capture(destination):
    if os.name != 'nt':
        raise OSError('Windows required')
    frozen = source_manifest()
    digest = fingerprint(frozen)
    destination.mkdir(parents=True, exist_ok=True)
    with (destination / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump({'sources': frozen, 'sourceSetSha256': digest, 'contract': contract.manifest(), 'limits': LIMITS}, stream, indent=2)
    import integration
    log = io.StringIO()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(integration.suite(digest))
    if not tests.wasSuccessful():
        print(log.getvalue())
        raise RuntimeError('private-launcher-failed-raw-capture-retained')
    if source_manifest() != frozen:
        raise ValueError('source-changed-during-capture')
    validate_records(integration.RESULTS, digest)
    publish(destination, {'sourceSetSha256': digest, 'sources': frozen, 'testCount': tests.testsRun,
                          'records': integration.RESULTS, 'log': log.getvalue()})
    print(log.getvalue())
    return 0


def publish(destination, measured):
    (destination / 'observations.json').write_text(json.dumps(measured['records'], indent=2), encoding='utf-8')
    (destination / 'tests.log').write_text(measured['log'], encoding='utf-8')
    (destination / 'assessment.json').write_text(
        json.dumps(admission_assessment(measured['sourceSetSha256']), indent=2), encoding='utf-8')
    evidence = {'projectDate': '2026-10-18', 'sources': measured['sources'],
        'sourceSetSha256': measured['sourceSetSha256'], 'testCount': measured['testCount'], 'testsSuccessful': True,
        'limits': LIMITS, 'artifactSha256': artifact_hashes(destination)}
    with (destination / 'evidence.json').open('x', encoding='utf-8') as stream:
        json.dump(evidence, stream, indent=2)


def check():
    entry = json.loads((OUT / 'input.json').read_text(encoding='utf-8'))
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    sources = source_manifest()
    digest = fingerprint(sources)
    if (any(record['sources'] != sources or record['sourceSetSha256'] != digest
            or canonical(record['limits']) != canonical(LIMITS) for record in (entry, evidence))
            or entry['contract'] != contract.manifest() or evidence['testCount'] != 1
            or evidence['testsSuccessful'] is not True or evidence['artifactSha256'] != artifact_hashes(OUT)):
        raise ValueError('private-launcher-source-artifact-or-admission-mismatch')
    validate_records(json.loads((OUT / 'observations.json').read_text(encoding='utf-8')), digest)
    validate_assessment(json.loads((OUT / 'assessment.json').read_text(encoding='utf-8')), digest)
    print('Owned ambient probe verified: shared-account file/socket reach; privacy OPEN; native disabled')
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
    destination = ROOT / '.git/tiye-ambient-access-development' / uuid.uuid4().hex if arguments.develop else OUT
    raise SystemExit(capture(destination) if arguments.capture or arguments.develop else check())
