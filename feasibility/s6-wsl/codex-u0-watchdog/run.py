"""Record synthetic Windows job observations, or verify saved artifacts only."""
import argparse
import hashlib
import io
import json
import platform
import time
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s4-codex-u0-watchdog'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check():
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    for name, expected in evidence['sourceSha256'].items():
        if sha(ROOT / name) != expected:
            raise ValueError('source-changed:' + name)
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('artifact-changed:' + name)
    if (evidence['testCount'] != 6 or evidence['testsSuccessful'] is not True
            or evidence['sourcesUnchanged'] is not True or evidence['nativeAdmissionGranted'] is not False):
        raise ValueError('saved-tests-incomplete')
    observations = json.loads((OUT / 'observations.json').read_text(encoding='utf-8'))
    cases = {item['case']: item for item in observations}
    if len(observations) != 6 or set(cases) != {'normal', 'nonzero-exit', 'deadline', 'root-exit-with-child',
                                              'watchdog-crash', 'owner-crash-before-resume'}:
        raise ValueError('missing-watchdog-case')
    for name in ['normal', 'nonzero-exit', 'deadline', 'root-exit-with-child']:
        if cases[name]['report']['windowsJobEmpty'] is not True:
            raise ValueError('job-not-empty:' + name)
    crash = cases['watchdog-crash']
    if not all(crash[key] is True for key in ['independentHandlesSignaled', 'unrelatedSentinelStillLive',
                                             'normalCompletionReportAbsent']):
        raise ValueError('crash-witness-incomplete')
    if cases['owner-crash-before-resume']['childCodeWitnessAbsent'] is not True:
        raise ValueError('suspended-child-witness-incomplete')
    if cases['nonzero-exit']['report']['finalRootExitCode'] != 7:
        raise ValueError('nonzero-exit-not-preserved')
    if evidence['nativeCodexRuns'] != 0 or evidence['wslRuns'] != 0:
        raise ValueError('incorrect-native-claim')
    print('Saved Windows watchdog evidence verified: 6 cases; no WSL/native Codex; Phase1 HOLD')
    return 0


def capture():
    if platform.system() != 'Windows':
        raise OSError('Windows required; no skipped qualification')
    if (OUT / 'evidence.json').exists():
        raise FileExistsError('Saved evidence exists; no overwrite')
    OUT.mkdir(exist_ok=True)
    frozen = {p.relative_to(ROOT).as_posix(): sha(p) for p in SOURCE.iterdir() if p.is_file()}
    manifest = {'sourceSha256': frozen, 'cases': ['normal', 'nonzero-exit', 'deadline', 'root-exit-with-child',
                                                'watchdog-crash', 'owner-crash-before-resume'],
                'deadlineCasesSeconds': 2, 'cleanupObservationSeconds': 2,
                'scope': 'Synthetic Windows Job Object fixture only', 'nativeAdmissionGranted': False}
    with (OUT / 'input.json').open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(manifest, stream, indent=2)
        stream.write('\n')
    import test_watchdog
    suite = unittest.defaultTestLoader.loadTestsFromModule(test_watchdog)
    log = io.StringIO()
    started = time.monotonic()
    result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    (OUT / 'tests.log').write_text(log.getvalue(), encoding='utf-8', newline='\n')
    (OUT / 'observations.json').write_text(json.dumps(test_watchdog.OBSERVATIONS, indent=2) + '\n', encoding='utf-8', newline='\n')
    unchanged = all(sha(ROOT / name) == expected for name, expected in frozen.items())
    evidence = {'projectDate': '2026-10-17', 'host': platform.platform(), 'python': platform.python_version(),
                'sourceSha256': frozen, 'artifactSha256': {name: sha(OUT / name)
                    for name in ['input.json', 'tests.log', 'observations.json', 'README.md', 'review.json']},
                'testCount': result.testsRun, 'testsSuccessful': result.wasSuccessful(),
                'elapsedSeconds': time.monotonic() - started, 'sourcesUnchanged': unchanged,
                'nativeCodexRuns': 0, 'wslRuns': 0, 'nativeAdmissionGranted': False, 'phase1': 'HOLD'}
    with (OUT / 'evidence.json').open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(evidence, stream, indent=2)
        stream.write('\n')
    print(json.dumps({'tests': result.testsRun, 'passed': result.wasSuccessful(),
                      'sourcesUnchanged': unchanged, 'nativeAdmissionGranted': False}))
    return 0 if result.wasSuccessful() and unchanged else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true', help='Run synthetic Windows cases once')
    args = parser.parse_args()
    raise SystemExit(capture() if args.capture else check())
