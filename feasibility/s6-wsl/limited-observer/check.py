"""Offline checks by default; --develop runs fixed synthetic integration cases."""
import argparse
import contextlib
import importlib.util
import io
import json
import unittest
import uuid

from bindings import composition
import build

OUT = composition.ROOT / 'output/s6-limited-observer'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-runtime-limits/evidence.json', 'output/s6-observed-u0/evidence.json',
              'output/s6-scheduled-wsl/evidence.json', 'output/s6-native-contract/contract.json'}
EXTRA = {'filesystemLimitsVerified', 'retainedSnapshotVerified', 'initializeResponseVerified',
         'initializedPeerReceiptEstablished', 'candidateExecuted', 'nativeAdmissionGranted'}
spec = importlib.util.spec_from_file_location('limited_saved_schedule',
                                            composition.SOURCE.parent / 'scheduled-wsl/check.py')
saved = importlib.util.module_from_spec(spec)
spec.loader.exec_module(saved)


def validate_observations(record):
    if (type(record) is not dict or set(record) != {'scope', 'tests', 'cases', 'nativeExecutionAllowed'}
            or record['scope'] != 'synthetic-supervised-private-mount-and-retention'
            or type(record['tests']) is not int or record['tests'] != 4
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 3):
        raise ValueError('limited-observer-scope-or-count')
    seen = set()
    for row in record['cases']:
        if (not EXTRA <= set(row) or row['mode'] in seen
                or row['mode'] not in {'owner-exit', 'stall', 'guardian-loss'}):
            raise ValueError('limited-case-schema-or-mode')
        seen.add(row['mode'])
        saved.validate_case({key: value for key, value in row.items() if key not in EXTRA})
        for key in EXTRA:
            if row[key] is not (key in {'filesystemLimitsVerified', 'retainedSnapshotVerified',
                                       'initializeResponseVerified'}):
                raise ValueError('limited-observation-or-permission-promotion')


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != composition.sources() or evidence['nativeExecutionAllowed'] is not False
            or (composition.SOURCE / 'linux_runtime.py').read_bytes() != build.generated()):
        raise ValueError('source-generated-or-permission-drift')
    for key, names, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, composition.ROOT)]:
        if set(evidence[key]) != names:
            raise ValueError('artifact-or-reference-set')
        for name, digest in evidence[key].items():
            if composition.sha(base / name) != digest:
                raise ValueError('artifact-or-reference-drift')
    validate_observations(json.loads((OUT / 'observations.json').read_bytes()))
    print('Saved supervised private-mount/retention evidence verified; native admission disabled')


def develop():
    import test_live
    from resources import BudgetCapture, MetadataFiles, writer
    with contextlib.ExitStack() as handles:
        capture = BudgetCapture(composition.LeaseBudget('collector'))
        handles.callback(capture.close)
        files = MetadataFiles(capture, capture.budget)
        handles.callback(files.close)
        bound = composition.sources()
        files.write('controller', 'attempt.json', writer.encode({'scope': 'limited-observer-harness', 'sources': bound}))
        log = io.StringIO()
        report = unittest.TextTestRunner(stream=log, verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromModule(test_live))
        payload = log.getvalue().encode()
        for offset in range(0, len(payload), writer.CHUNK):
            files.write('observer', 'stdout.bin', payload[offset:offset + writer.CHUNK])
        files.write('controller', 'outcome.json', writer.encode({'successful': report.wasSuccessful(),
            'testsRun': report.testsRun, 'privateRuns': test_live.PRIVATE_RUNS}))
        files.audit()
        locator = str(capture.storage.path)
        if not report.wasSuccessful() or composition.sources() != bound:
            (composition.ROOT / '.git/tiye-limited-observer-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': locator}), encoding='utf-8')
            raise RuntimeError('limited-observer-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-supervised-private-mount-and-retention',
                    'tests': report.testsRun, 'cases': test_live.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
    destination = composition.ROOT / '.git/tiye-limited-observer' / uuid.uuid4().hex
    destination.mkdir(parents=True)
    for name, record in [('observations.json', selected), ('sources.json', bound),
                         ('private-locator.json', {'path': locator})]:
        (destination / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Three supervised cases and transfer-rejection suite passed: ' + str(destination / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        develop()
    else:
        verify()
