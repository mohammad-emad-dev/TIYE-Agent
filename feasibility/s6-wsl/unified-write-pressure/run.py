"""Unified synthetic write-pressure launcher; default offline, native execution disabled."""
import argparse
import hashlib
import io
import json
import os
import platform
import sys
import time
import unittest
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-unified-write-pressure'
sys.path.insert(0, str(SOURCE))
import profile


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(SOURCE.glob('*.py'))}


def validate(records):
    from validation import validate_records
    validate_records(records)


def capture(output):
    if os.name != 'nt':
        raise OSError('Windows required')
    frozen = sources()
    output.mkdir(parents=True, exist_ok=True)
    installation = ROOT / 'output/s4-codex-candidate/installation.json'
    installed = json.loads(installation.read_text(encoding='utf-8'))['linux']
    future_candidate = {key: installed[key] for key in ('binary', 'binarySha256')}
    future_candidate.update(installationSha256=sha(installation), executed=False)
    with (output / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump({'sourceSha256': frozen, 'distribution': 'Ubuntu', 'uid': 1000,
            'cases': list(profile.MODES) + ['partial-journal-refusal', 'native-refusal', 'cleanup-hook-failure'],
            'profile': profile.manifest(), 'futureNativeCandidate': future_candidate,
            'nativeAdmissionGranted': False}, stream, indent=2)
    import test_unified
    test_unified.DESTINATION = output
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(test_unified.UnifiedTests)
    log = io.StringIO()
    started = time.monotonic()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    (output / 'tests.log').write_text(log.getvalue(), encoding='utf-8')
    (output / 'observations.json').write_text(json.dumps(test_unified.OBSERVATIONS, indent=2), encoding='utf-8')
    evidence = {'projectDate': '2026-10-17', 'windows': platform.platform(), 'python': platform.python_version(),
        'sourceSha256': frozen, 'sourcesUnchanged': frozen == sources(),
        'testCount': tests.testsRun, 'testsSuccessful': tests.wasSuccessful(),
        'elapsedSeconds': time.monotonic() - started, 'nativeProviderRuns': 0,
        'nativeAdmissionGranted': False, 'phase1': 'HOLD',
        'artifactSha256': {p.relative_to(output).as_posix(): sha(p) for p in output.rglob('*') if p.is_file()}}
    with (output / 'evidence.json').open('x', encoding='utf-8') as stream:
        json.dump(evidence, stream, indent=2)
    print(log.getvalue())
    if not tests.wasSuccessful() or not evidence['sourcesUnchanged']:
        return 1
    validate(test_unified.OBSERVATIONS)
    return 0


def check():
    for path in SOURCE.glob('*.py'):
        compile(path.read_text(encoding='utf-8'), path.name, 'exec')
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if sources() != evidence['sourceSha256'] or evidence['sourcesUnchanged'] is not True:
        raise ValueError('unified-lifecycle-sources-changed')
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('unified-lifecycle-artifact-changed:' + name)
    if (evidence['testCount'] != 6 or evidence['testsSuccessful'] is not True
            or evidence['nativeProviderRuns'] != 0 or evidence['nativeAdmissionGranted'] is not False
            or evidence['phase1'] != 'HOLD'):
        raise ValueError('unified-lifecycle-capture-incomplete')
    entry = json.loads((OUT / 'input.json').read_text(encoding='utf-8'))
    if entry['profile'] != profile.manifest() or entry['futureNativeCandidate']['executed'] is not False:
        raise ValueError('unified-profile-or-native-candidate-state')
    validate(json.loads((OUT / 'observations.json').read_text(encoding='utf-8')))
    print('Saved unified Windows/WSL synthetic write-pressure launcher: 3 interventions + partial/restart journal refusals + native refusal; native admission disabled')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native', action='store_true')
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--develop', action='store_true')
    arguments = parser.parse_args()
    if arguments.native:
        parser.error('native-execution-disabled: fixed mock launcher only')
    if arguments.capture and arguments.develop:
        parser.error('choose one destination')
    if arguments.capture:
        for name in ('README.md', 'review.json'):
            if not (OUT / name).is_file():
                raise ValueError('capture-prerequisite-missing:' + name)
    destination = ROOT / '.git/tiye-unified-write-pressure-development' / uuid.uuid4().hex if arguments.develop else OUT
    raise SystemExit(capture(destination) if arguments.capture or arguments.develop else check())
