"""Offline checks by default; --develop executes only fixed synthetic fixtures."""
import argparse
import contextlib
import importlib.util
import io
import json
import unittest
import uuid

from bindings import composition
import build

OUT = composition.ROOT / 'output/s6-observed-u0'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-startup-observer/evidence.json', 'output/s6-scheduled-wsl/evidence.json',
              'output/s6-native-inventory/profile.json', 'output/s6-native-contract/contract.json'}
EXTRA = {'startupObserverVerified', 'initializeResponseVerified', 'initializedPeerReceiptEstablished',
         'candidateExecuted', 'nativeAdmissionGranted'}
spec = importlib.util.spec_from_file_location('sealed_schedule_validation',
                                            composition.SOURCE.parent / 'scheduled-wsl/check.py')
saved_schedule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(saved_schedule)


def validate_observations(record):
    if (type(record) is not dict or set(record) != {'scope', 'tests', 'cases', 'nativeExecutionAllowed'}
            or record['scope'] != 'synthetic-supervised-initialize-and-startup-observer'
            or type(record['tests']) is not int or record['tests'] != 5
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 3):
        raise ValueError('observed-initialize-scope')
    seen = set()
    for row in record['cases']:
        if not EXTRA <= set(row) or row['mode'] in seen or row['mode'] not in composition.MODES:
            raise ValueError('observed-case-schema-or-mode')
        seen.add(row['mode'])
        saved_schedule.validate_case({key: value for key, value in row.items() if key not in EXTRA})
        for key in EXTRA:
            if row[key] is not (key in {'startupObserverVerified', 'initializeResponseVerified'}):
                raise ValueError('startup-or-protocol-promotion')


def validate_evidence(evidence):
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != composition.sources() or evidence['nativeExecutionAllowed'] is not False
            or (composition.SOURCE / 'linux_runtime.py').read_bytes() != build.generated()):
        raise ValueError('source-generated-or-admission-drift')
    for key, expected, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, composition.ROOT)]:
        if set(evidence[key]) != expected:
            raise ValueError('artifact-or-reference-set')
        for name, digest in evidence[key].items():
            if composition.sha(base / name) != digest:
                raise ValueError('artifact-or-reference-drift')


def develop():
    import test_live
    from resources import BudgetCapture, MetadataFiles, writer
    with contextlib.ExitStack() as handles:
        capture = BudgetCapture(composition.LeaseBudget('collector'))
        handles.callback(capture.close)
        files = MetadataFiles(capture, capture.budget)
        handles.callback(files.close)
        bound = composition.sources()
        files.write('controller', 'attempt.json', writer.encode({'scope': 'separate-observed-u0-harness',
                                                                'sources': bound}))
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
            (composition.ROOT / '.git/tiye-observed-u0-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': locator}), encoding='utf-8')
            raise RuntimeError('observed-fixtures-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-supervised-initialize-and-startup-observer',
                    'tests': report.testsRun, 'cases': test_live.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
    destination = composition.ROOT / '.git/tiye-observed-u0' / uuid.uuid4().hex
    destination.mkdir(parents=True)
    for name, record in [('observations.json', selected), ('sources.json', bound),
                         ('private-locator.json', {'path': locator})]:
        (destination / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Supervised synthetic initialize/observer passed: ' + str(destination / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        develop()
    else:
        validate_evidence(json.loads((OUT / 'evidence.json').read_text()))
        validate_observations(json.loads((OUT / 'observations.json').read_text()))
        print('Saved synthetic initialize/observer verified; native admission remains disabled')
