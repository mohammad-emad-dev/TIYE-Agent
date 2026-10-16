"""One exclusive synthetic capture or offline verification of the saved capture."""
import argparse
import hashlib
import io
import json
import platform
import sys
import time
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s4-codex-u0-supervised'
sys.path.insert(0, str(SOURCE))
from run import source_hashes

CASES = {'valid', 'foreign', 'invalid-raw', 'blocked-host', 'host-exit-with-descendants',
         'watchdog-crash', 'native-refusal', 'relaunch-refusal'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_exclusive(path, content):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(content)


def json_text(record):
    return json.dumps(record, indent=2) + '\n'


def check():
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if source_hashes() != evidence['sourceSha256']:
        raise ValueError('integration-or-frozen-dependency-source-changed')
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('artifact-changed:' + name)
    if (evidence['testsSuccessful'] is not True or evidence['testCount'] != 6
            or evidence['sourcesUnchanged'] is not True or evidence['nativeRuns'] != 0
            or evidence['wslRuns'] != 0 or evidence['nativeAdmissionGranted'] is not False):
        raise ValueError('incomplete-integration-evidence')
    observations = json.loads((OUT / 'observations.json').read_text(encoding='utf-8'))
    cases = {record['case']: record for record in observations}
    if len(observations) != 8 or set(cases) != CASES:
        raise ValueError('integration-cases-missing')
    for mode in ['valid', 'foreign', 'invalid-raw', 'blocked-host', 'host-exit-with-descendants']:
        if not all(cases[mode]['watchdog'][key] is True
                   for key in ['windowsJobEmpty', 'rootHandleSignaled']):
            raise ValueError('integrated-job-witness-incomplete')
    for mode in CASES - {'native-refusal', 'relaunch-refusal'}:
        if cases[mode]['independentHandlesSignaled'] is not True:
            raise ValueError('independent-witness-incomplete')
    if (cases['valid']['host']['syntheticProtocolObserved'] is not True
            or cases['foreign']['host']['syntheticProtocolObserved'] is not False
            or cases['invalid-raw']['host']['syntheticProtocolObserved'] is not False
            or not cases['invalid-raw']['host']['protocolValidationFault']
            or cases['watchdog-crash']['unrelatedSentinelStillLive'] is not True
            or cases['native-refusal']['launchArtifactsAbsent'] is not True
            or cases['relaunch-refusal']['priorRecordUnchanged'] is not True
            or cases['relaunch-refusal']['launchArtifactsAbsent'] is not True):
        raise ValueError('integration-outcomes-incomplete')
    print('Saved integrated Windows fixture: 6 tests / 8 cases; native disabled; Phase1 HOLD')
    return 0


def capture():
    if platform.system() != 'Windows':
        raise OSError('Windows required; no skipped qualification')
    for required in ['README.md', 'review.json']:
        if not (OUT / required).is_file():
            raise ValueError('capture-prerequisite-missing:' + required)
    frozen = source_hashes()
    OUT.mkdir(exist_ok=True)
    write_exclusive(OUT / 'input.json', json_text({'sourceSha256': frozen, 'cases': sorted(CASES),
        'scope': 'synthetic-windows-integration-only', 'nativeAdmissionGranted': False}))
    import test_supervised
    test_supervised.OBSERVATIONS.clear()
    suite = unittest.defaultTestLoader.loadTestsFromModule(test_supervised)
    log = io.StringIO()
    started = time.monotonic()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    write_exclusive(OUT / 'tests.log', log.getvalue())
    write_exclusive(OUT / 'observations.json', json_text(test_supervised.OBSERVATIONS))
    unchanged = source_hashes() == frozen
    evidence = {'projectDate': '2026-10-17', 'host': platform.platform(),
        'python': platform.python_version(), 'sourceSha256': frozen,
        'artifactSha256': {name: sha(OUT / name) for name in
                          ['input.json', 'tests.log', 'observations.json', 'README.md', 'review.json']},
        'testCount': tests.testsRun, 'testsSuccessful': tests.wasSuccessful(),
        'sourcesUnchanged': unchanged, 'elapsedSeconds': time.monotonic() - started,
        'nativeRuns': 0, 'wslRuns': 0, 'nativeAdmissionGranted': False, 'phase1': 'HOLD'}
    write_exclusive(OUT / 'evidence.json', json_text(evidence))
    print(json.dumps({'tests': tests.testsRun, 'passed': tests.wasSuccessful(),
                      'sourcesUnchanged': unchanged, 'cases': len(test_supervised.OBSERVATIONS)}))
    return 0 if tests.wasSuccessful() and unchanged else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true', help='Run the synthetic cases once')
    arguments = parser.parse_args()
    raise SystemExit(capture() if arguments.capture else check())
