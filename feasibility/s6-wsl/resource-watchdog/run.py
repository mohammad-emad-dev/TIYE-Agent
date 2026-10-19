"""Offline saved-evidence check; --develop runs fixed Windows Job fixtures."""
import argparse
import contextlib
import io
import json
import unittest
import uuid

import composition

OUT = composition.ROOT / 'output/s6-resource-watchdog'
ARTIFACTS = {'README.md', 'observations.json', 'review.json'}
REFERENCES = {'output/s6-resource-launcher/evidence.json', 'output/s6-native-contract/contract.json',
              'output/s6-native-preflight/reconciliation.json'}


def validate_observations(record):
    expected = {'scope', 'unitTests', 'cases', 'nativeExecutionAllowed', 'deadlineSeconds', 'observationSeconds'}
    if (set(record) != expected or record['scope'] != 'synthetic-windows-job-resource-composition'
            or type(record['unitTests']) is not int or record['unitTests'] != 8
            or record['nativeExecutionAllowed'] is not False or type(record['deadlineSeconds']) is not int
            or record['deadlineSeconds'] != composition.DEADLINE or type(record['observationSeconds']) is not int
            or record['observationSeconds'] != composition.OBSERVE or type(record['cases']) is not list
            or len(record['cases']) != 4):
        raise ValueError('saved-scope-or-count')
    modes = set()
    for row in record['cases']:
        validate_case(row)
        if row['mode'] in modes:
            raise ValueError('duplicate-case')
        modes.add(row['mode'])


def validate_case(row):
    fields = {'mode', 'verified', 'guardianReported', 'windowsJobEmpty', 'heldRootAndProtocolSignaled',
              'unrelatedSentinelSurvived', 'workerStorageCompleted', 'workerEvidenceUncertain',
              'nativeExecutionAllowed'}
    if set(row) != fields or row['mode'] not in composition.MODES:
        raise ValueError('case-schema-private-fields-forbidden')
    mode = row['mode']
    expected = {'verified': True, 'guardianReported': mode != 'guardian-loss',
                'windowsJobEmpty': True if mode != 'guardian-loss' else None,
                'heldRootAndProtocolSignaled': True if mode != 'valid' else None,
                'unrelatedSentinelSurvived': True if mode != 'valid' else None,
                'workerStorageCompleted': mode == 'valid', 'workerEvidenceUncertain': mode != 'valid',
                'nativeExecutionAllowed': False}
    if any(row[name] is not verdict for name, verdict in expected.items()):
        raise ValueError('false-verdict-or-admission-promotion')


def validate_evidence(evidence):
    if set(evidence) != {'sources', 'artifacts', 'references', 'leaseCaps', 'nativeExecutionAllowed'}:
        raise ValueError('evidence-schema')
    if (evidence['sources'] != composition.sources() or evidence['leaseCaps'] != composition.SLICES
            or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('source-lease-or-admission-drift')
    if set(evidence['artifacts']) != ARTIFACTS or set(evidence['references']) != REFERENCES:
        raise ValueError('artifact-or-reference-set')
    for name, digest in evidence['artifacts'].items():
        if composition.sha(OUT / name) != digest:
            raise ValueError('artifact-drift')
    for name, digest in evidence['references'].items():
        if composition.sha(composition.ROOT / name) != digest:
            raise ValueError('reference-drift')


def check():
    validate_evidence(json.loads((OUT / 'evidence.json').read_text()))
    validate_observations(json.loads((OUT / 'observations.json').read_text()))
    print('Saved independent Windows Job resource cases verified; WSL/native admission disabled')


def develop():
    import test_watchdog
    from resources import BudgetCapture, MetadataFiles, writer
    with contextlib.ExitStack() as cleanup:
        capture = BudgetCapture(composition.LeaseBudget('collector'))
        cleanup.callback(capture.close)
        files = MetadataFiles(capture, capture.budget)
        cleanup.callback(files.close)
        files.write('controller', 'attempt.json', b'{"scope":"separate-development-harness"}')
        log = io.StringIO()
        report = unittest.TextTestRunner(stream=log, verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromModule(test_watchdog))
        payload = log.getvalue().encode()
        for offset in range(0, len(payload), writer.CHUNK):
            files.write('observer', 'stdout.bin', payload[offset:offset + writer.CHUNK])
        files.write('controller', 'outcome.json', writer.encode({'successful': report.wasSuccessful(),
                    'testsRun': report.testsRun, 'privateRuns': test_watchdog.PRIVATE_RUNS}))
        files.audit()
        if not report.wasSuccessful():
            failure = composition.ROOT / '.git/tiye-resource-watchdog-failure.json'
            failure.write_text(json.dumps({'privateDiagnosticRoot': str(capture.storage.path)}), encoding='utf-8')
            raise RuntimeError('job-fixtures-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-windows-job-resource-composition', 'unitTests': report.testsRun,
                    'cases': test_watchdog.OBSERVATIONS, 'nativeExecutionAllowed': False,
                    'deadlineSeconds': composition.DEADLINE, 'observationSeconds': composition.OBSERVE}
        validate_observations(selected)
        locator = str(capture.storage.path)
    target = composition.ROOT / '.git/tiye-resource-watchdog' / uuid.uuid4().hex
    target.mkdir(parents=True)
    for name, record in (('observations.json', selected), ('sources.json', composition.sources()),
                         ('private-locator.json', {'path': locator})):
        (target / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Synthetic Job tests passed; selected result: ' + str(target / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    develop() if args.develop else check()
