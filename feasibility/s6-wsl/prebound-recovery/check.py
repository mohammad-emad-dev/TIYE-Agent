"""Offline evidence checks; --develop runs only fixed synthetic integration cases."""
import argparse
import contextlib
import importlib.util
import io
import json
import unittest
import uuid

from bindings import composition
import build

OUT = composition.ROOT / 'output/s6-prebound-recovery'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-scheduled-unknown/evidence.json', 'output/s6-unknown-keeper/evidence.json',
              'output/s6-native-contract/contract.json'}
spec = importlib.util.spec_from_file_location('unknown_schedule_schema',
                                            composition.SOURCE.parent / 'scheduled-wsl/check.py')
saved = importlib.util.module_from_spec(spec)
spec.loader.exec_module(saved)


def validate_snapshot(row, state):
    disposed = state == 'disposed-fixed-fixture'
    fields = {'mode', 'scope', 'outcome', 'cleanupVerified', 'unsettledOperations', 'automaticRetryAllowed',
        'nativeExecutionAllowed', 'phases', 'cleanupCutoffSeconds', 'retentionReceiptVerified',
        'retentionOutcome', 'keeperOwnership', 'keeperLiveAtObservation', 'fixtureDisposalVerified',
        'windowsJobEmpty', 'automaticDeletionAllowed', 'candidateExecuted', 'nativeAdmissionGranted', 'recoveryVerified', 'observerLossVerified'}
    if type(row) is not dict or set(row) != fields or row['mode'] not in composition.MODES:
        raise ValueError('unknown-snapshot-schema')
    if (row['scope'] != 'synthetic-scheduled-windows-ubuntu-adapters' or row['outcome'] != 'unknown'
            or row['retentionOutcome'] != 'unknown'
            or row['keeperOwnership'] != state
            or type(row['unsettledOperations']) is not int or row['unsettledOperations'] != 0):
        raise ValueError('unknown-snapshot-promotion')
    for field in ('cleanupVerified', 'automaticRetryAllowed', 'nativeExecutionAllowed',
                  'automaticDeletionAllowed', 'candidateExecuted', 'nativeAdmissionGranted'):
        if row[field] is not False:
            raise ValueError('unknown-snapshot-permission')
    if (row['retentionReceiptVerified'] is not True or row['keeperLiveAtObservation'] is not True
            or row['fixtureDisposalVerified'] is not disposed
            or row['recoveryVerified'] is not (state != 'held')
            or row['observerLossVerified'] is not (state != 'held')
            or row['windowsJobEmpty'] is not (None if row['mode'] == 'guardian-loss' else True)):
        raise ValueError('unknown-ownership-incomplete')
    if (type(row['phases']) is not list or [phase.get('phase') for phase in row['phases']]
            != ['host-start', 'child-start', 'initialize', 'eof', 'observe']):
        raise ValueError('unknown-phase-sequence')
    previous = 0
    for phase in row['phases']:
        previous = saved.validate_phase(phase, previous)
    cutoff = row['cleanupCutoffSeconds']
    if (type(cutoff) not in (int, float) or not previous < cutoff <= 75
            or cutoff - row['phases'][3]['startSeconds'] > 15):
        raise ValueError('unknown-shared-cutoff')


def validate_observations(record):
    if (type(record) is not dict or set(record) != {'scope', 'tests', 'cases', 'nativeExecutionAllowed'}
            or record['scope'] != 'synthetic-prebound-unknown-recovery'
            or type(record['tests']) is not int or record['tests'] != 5
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 3):
        raise ValueError('scheduled-unknown-scope')
    modes = set()
    for row in record['cases']:
        stages = {'observed': 'held', 'afterObserverLoss': 'recovered-held',
                  'afterExplicitFixtureDisposal': 'disposed-fixed-fixture'}
        if type(row) is not dict or set(row) != set(stages):
            raise ValueError('prebound-recovery-case')
        before = row['observed']
        for name, state in stages.items():
            validate_snapshot(row[name], state)
            unchanged = lambda snapshot: {key: value for key, value in snapshot.items()
                if key not in {'keeperOwnership', 'fixtureDisposalVerified', 'recoveryVerified', 'observerLossVerified'}}
            if unchanged(before) != unchanged(row[name]):
                raise ValueError('prebound-recovery-promoted-original-result')
        if before['mode'] in modes:
            raise ValueError('prebound-recovery-repeated-mode')
        modes.add(before['mode'])


def verify():
    evidence = json.loads((OUT / 'evidence.json').read_bytes())
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != composition.sources() or evidence['nativeExecutionAllowed'] is not False
            or (composition.SOURCE / 'linux_runtime.py').read_bytes() != build.generated()):
        raise ValueError('supervised-source-or-admission-drift')
    for key, names, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, composition.ROOT)]:
        if set(evidence[key]) != names:
            raise ValueError('supervised-artifact-set')
        for name, digest in evidence[key].items():
            if composition.sha(base / name) != digest:
                raise ValueError('supervised-artifact-drift')
    validate_observations(json.loads((OUT / 'observations.json').read_bytes()))
    print('Saved prebound unknown recovery evidence verified; native admission disabled')


def develop():
    import test_live
    from resources import BudgetCapture, MetadataFiles, writer
    with contextlib.ExitStack() as handles:
        capture = BudgetCapture(composition.LeaseBudget('collector'))
        handles.callback(capture.close)
        files = MetadataFiles(capture, capture.budget)
        handles.callback(files.close)
        bound = composition.sources()
        files.write('controller', 'attempt.json', writer.encode({'scope': 'scheduled-unknown-harness', 'sources': bound}))
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
            (composition.ROOT / '.git/tiye-prebound-recovery-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': locator}), encoding='utf-8')
            raise RuntimeError('scheduled-unknown-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-prebound-unknown-recovery',
                    'tests': report.testsRun, 'cases': test_live.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
    destination = composition.ROOT / '.git/tiye-prebound-recovery' / uuid.uuid4().hex
    destination.mkdir(parents=True)
    for name, record in [('observations.json', selected), ('sources.json', bound),
                         ('private-locator.json', {'path': locator})]:
        (destination / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Three prebound recovery cases passed: ' + str(destination / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        develop()
    else:
        verify()
