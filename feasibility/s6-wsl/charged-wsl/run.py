"""Offline evidence validation; --develop runs three synthetic cross-OS cases."""
import argparse
import contextlib
import io
import json
import unittest
import uuid

import composition
import linux_runtime

OUT = composition.ROOT / 'output/s6-charged-wsl'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-resource-watchdog/evidence.json', 'output/s6-native-contract/contract.json',
              'output/s6-native-preflight/reconciliation.json'}


def validate_observations(record):
    if (set(record) != {'scope', 'unitTests', 'cases', 'nativeExecutionAllowed'}
            or record['scope'] != 'synthetic-windows-job-and-wsl-lease'
            or type(record['unitTests']) is not int or record['unitTests'] != 6
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 3):
        raise ValueError('observation-scope-or-count')
    seen = set()
    for row in record['cases']:
        validate_case(row)
        if row['mode'] in seen:
            raise ValueError('duplicate-case')
        seen.add(row['mode'])


def validate_case(row):
    fields = {'mode', 'verified', 'windowsHeldProcessesSignaled', 'windowsJobEmpty', 'linuxPidfdsSignaled',
              'linuxCgroupEmpty', 'linuxSentinelSurvived', 'leaseExpiredBeforeWindowsDeadline',
              'leaseReason', 'workerEvidenceUncertain', 'nativeExecutionAllowed'}
    if set(row) != fields or row['mode'] not in composition.MODES:
        raise ValueError('case-schema-private-fields-forbidden')
    mode = row['mode']
    expected = {'verified': True, 'windowsHeldProcessesSignaled': True,
        'windowsJobEmpty': None if mode == 'guardian-loss' else True, 'linuxPidfdsSignaled': True,
        'linuxCgroupEmpty': True, 'linuxSentinelSurvived': True,
        'leaseExpiredBeforeWindowsDeadline': True if mode == 'stall' else None,
        'workerEvidenceUncertain': True, 'nativeExecutionAllowed': False}
    if (any(row[name] is not verdict for name, verdict in expected.items())
            or row['leaseReason'] not in ('eof', 'expired') or (mode == 'stall' and row['leaseReason'] != 'expired')):
        raise ValueError('case-verdict-or-admission-promotion')


def validate_evidence(evidence):
    fields = {'sources', 'artifacts', 'references', 'windowsSlices', 'linuxSlices', 'linuxReservedBytes',
              'windowsDeadlineSeconds', 'nativeExecutionAllowed'}
    if set(evidence) != fields:
        raise ValueError('evidence-schema')
    if (evidence['sources'] != composition.sources() or evidence['windowsSlices'] != composition.SLICES
            or evidence['linuxSlices'] != linux_runtime.CAPS
            or type(evidence['linuxReservedBytes']) is not int or evidence['linuxReservedBytes'] != linux_runtime.RESERVED
            or type(evidence['windowsDeadlineSeconds']) is not int or evidence['windowsDeadlineSeconds'] != composition.DEADLINE
            or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('source-budget-clock-or-admission-drift')
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
    print('Saved charged WSL lease/witness cases verified; native admission disabled')


def develop():
    import test_charged
    from resources import BudgetCapture, MetadataFiles, writer
    with contextlib.ExitStack() as cleanup:
        capture = BudgetCapture(composition.LeaseBudget('collector'))
        cleanup.callback(capture.close)
        files = MetadataFiles(capture, capture.budget)
        cleanup.callback(files.close)
        files.write('controller', 'attempt.json', b'{"scope":"separate-development-harness"}')
        log = io.StringIO()
        report = unittest.TextTestRunner(stream=log, verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromModule(test_charged))
        payload = log.getvalue().encode()
        for offset in range(0, len(payload), writer.CHUNK):
            files.write('observer', 'stdout.bin', payload[offset:offset + writer.CHUNK])
        files.write('controller', 'outcome.json', writer.encode({'successful': report.wasSuccessful(),
                    'testsRun': report.testsRun, 'privateRuns': test_charged.PRIVATE_RUNS}))
        files.audit()
        if not report.wasSuccessful():
            (composition.ROOT / '.git/tiye-charged-wsl-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': str(capture.storage.path)}), encoding='utf-8')
            raise RuntimeError('wsl-fixtures-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-windows-job-and-wsl-lease', 'unitTests': report.testsRun,
                    'cases': test_charged.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
        locator = str(capture.storage.path)
    target = composition.ROOT / '.git/tiye-charged-wsl' / uuid.uuid4().hex
    target.mkdir(parents=True)
    for name, record in (('observations.json', selected), ('sources.json', composition.sources()),
                         ('private-locator.json', {'path': locator})):
        (target / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Charged cross-OS tests passed; selected result: ' + str(target / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    develop() if args.develop else check()
