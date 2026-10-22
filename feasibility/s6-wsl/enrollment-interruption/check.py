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

OUT = composition.ROOT / 'output/s6-enrollment-interruption'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-prebound-recovery/evidence.json', 'output/s6-unknown-keeper/evidence.json',
              'output/s6-native-contract/contract.json'}
spec = importlib.util.spec_from_file_location('unknown_schedule_schema',
                                            composition.SOURCE.parent / 'scheduled-wsl/check.py')
saved = importlib.util.module_from_spec(spec)
spec.loader.exec_module(saved)


def validate_snapshot(row, disposed):
    fields = {'mode', 'scope', 'outcome', 'cleanupVerified', 'unsettledOperations', 'automaticRetryAllowed',
        'nativeExecutionAllowed', 'phases', 'cleanupCutoffSeconds', 'retentionReceiptVerified',
        'retentionOutcome', 'keeperOwnership', 'keeperLiveAtObservation', 'fixtureDisposalVerified',
        'windowsJobEmpty', 'automaticDeletionAllowed', 'candidateExecuted', 'nativeAdmissionGranted', 'interruptionVerified', 'enrollmentState', 'standbyState', 'ownerReceiptVerified'}
    if type(row) is not dict or set(row) != fields or row['mode'] not in ('owner-exit', 'stall', 'guardian-loss'):
        raise ValueError('unknown-snapshot-schema')
    if (row['scope'] != 'synthetic-scheduled-windows-ubuntu-adapters' or row['outcome'] != 'unknown'
            or row['retentionOutcome'] != 'unknown'
            or row['keeperOwnership'] != ('disposed-fixed-fixture' if disposed else 'held')
            or type(row['unsettledOperations']) is not int or row['unsettledOperations'] != 0):
        raise ValueError('unknown-snapshot-promotion')
    for field in ('cleanupVerified', 'automaticRetryAllowed', 'nativeExecutionAllowed',
                  'automaticDeletionAllowed', 'candidateExecuted', 'nativeAdmissionGranted'):
        if row[field] is not False:
            raise ValueError('unknown-snapshot-permission')
    if (row['retentionReceiptVerified'] is not True or row['keeperLiveAtObservation'] is not True
            or row['fixtureDisposalVerified'] is not disposed
            or row['windowsJobEmpty'] is not (None if row['mode'] == 'guardian-loss' else True)):
        raise ValueError('unknown-ownership-incomplete')
    fault = {'owner-exit': ('committed', 'live', True), 'stall': ('pending', 'live', False),
             'guardian-loss': ('committed', 'ended', True)}[row['mode']]
    if (row['interruptionVerified'] is not True or row['enrollmentState'] != fault[0]
            or row['standbyState'] != fault[1] or row['ownerReceiptVerified'] is not fault[2]):
        raise ValueError('enrollment-interruption-evidence')
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
            or record['scope'] != 'synthetic-enrollment-interruption'
            or type(record['tests']) is not int or record['tests'] != 5
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 3):
        raise ValueError('scheduled-unknown-scope')
    modes = set()
    for row in record['cases']:
        if type(row) is not dict or set(row) != {'afterInterruption', 'afterExplicitFixtureDisposal'}:
            raise ValueError('scheduled-unknown-case')
        before, after = row['afterInterruption'], row['afterExplicitFixtureDisposal']
        validate_snapshot(before, False)
        validate_snapshot(after, True)
        if (before['mode'] in modes or before['mode'] != after['mode']
                or {key: value for key, value in before.items()
                    if key not in {'keeperOwnership', 'fixtureDisposalVerified'}}
                != {key: value for key, value in after.items()
                    if key not in {'keeperOwnership', 'fixtureDisposalVerified'}}):
            raise ValueError('unknown-disposal-promoted-or-repeated')
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
    print('Saved enrollment interruption evidence verified; native admission disabled')


def develop():
    if (composition.SOURCE / 'linux_runtime.py').read_bytes() != build.generated():
        raise ValueError('interruption-generated-runtime-stale')
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
            (composition.ROOT / '.git/tiye-enrollment-interruption-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': locator}), encoding='utf-8')
            raise RuntimeError('scheduled-unknown-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-enrollment-interruption',
                    'tests': report.testsRun, 'cases': test_live.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
    destination = composition.ROOT / '.git/tiye-enrollment-interruption' / uuid.uuid4().hex
    destination.mkdir(parents=True)
    for name, record in [('observations.json', selected), ('sources.json', bound),
                         ('private-locator.json', {'path': locator})]:
        (destination / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Three enrollment interruption cases passed: ' + str(destination / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        develop()
    else:
        verify()
