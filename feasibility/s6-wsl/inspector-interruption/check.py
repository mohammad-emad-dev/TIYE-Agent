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

OUT = composition.ROOT / 'output/s6-inspector-interruption'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-custody-recovery/evidence.json', 'output/s6-uncertain-shutdown/evidence.json',
              'output/s6-native-contract/contract.json'}
spec = importlib.util.spec_from_file_location('unknown_schedule_schema',
                                            composition.SOURCE.parent / 'scheduled-wsl/check.py')
saved = importlib.util.module_from_spec(spec)
spec.loader.exec_module(saved)


def validate_snapshot(row,stage):
    fields={'mode','scope','outcome','cleanupVerified','unsettledOperations','automaticRetryAllowed',
        'nativeExecutionAllowed','phases','cleanupCutoffSeconds','retentionReceiptVerified','retentionOutcome',
        'keeperOwnership','keeperLiveAtObservation','fixtureDisposalVerified','windowsJobEmpty',
        'automaticDeletionAllowed','candidateExecuted','nativeAdmissionGranted','evidenceFault','terminalEvidence',
        'custodyInventoryVerified','duplicateClosureVerified','linuxFinalInventoryVerified',
        'observerLossVerified','standbyInspectionVerified','inspectorPersistence','automaticReleaseAllowed',
        'interruption','interruptionVerified','slotOccupied','inspectorState','enrollmentAckObserved'}
    if type(row) is not dict or set(row)!=fields or row['evidenceFault'] not in {'missing','receipt-blocked'}:
        raise ValueError('inspector-snapshot-schema')
    fault=row['evidenceFault']
    interruption='unobserved-ack' if fault=='receipt-blocked' else 'inspector-loss'
    lost=stage>0 and interruption=='unobserved-ack'
    expected={'mode':'owner-exit','scope':'synthetic-scheduled-windows-ubuntu-adapters','outcome':'unknown',
        'cleanupVerified':False,'unsettledOperations':0,'automaticRetryAllowed':False,'nativeExecutionAllowed':False,
        'retentionReceiptVerified':fault!='receipt-blocked','retentionOutcome':'unknown',
        'keeperOwnership':'disposed-fixed-fixture' if stage==2 else ('inspected-held' if lost else 'held'),
        'keeperLiveAtObservation':True,'fixtureDisposalVerified':stage==2,'windowsJobEmpty':True,
        'automaticDeletionAllowed':False,'candidateExecuted':False,'nativeAdmissionGranted':False,
        'terminalEvidence':'absent' if fault=='missing' else 'invalid','custodyInventoryVerified':True,
        'duplicateClosureVerified':True,'linuxFinalInventoryVerified':False,'observerLossVerified':lost,
        'standbyInspectionVerified':lost,'inspectorPersistence':'keeper-memory-only' if stage>0 else 'unconfirmed',
        'automaticReleaseAllowed':False,'interruption':interruption,'interruptionVerified':stage>0,
        'slotOccupied':stage>0,'inspectorState':('ended' if interruption=='inspector-loss' else 'live') if stage>0 else 'unconfirmed',
        'enrollmentAckObserved':stage>0 and interruption=='inspector-loss'}
    if json.dumps({key:row[key] for key in expected},sort_keys=True)!=json.dumps(expected,sort_keys=True):
        raise ValueError('inspector-snapshot-binding-or-promotion')
    if (type(row['phases']) is not list or [phase.get('phase') for phase in row['phases']]
            !=['host-start','child-start','initialize','eof','observe']):
        raise ValueError('inspector-phase-sequence')
    previous=0
    for phase in row['phases']:
        previous=saved.validate_phase(phase,previous)
    cutoff=row['cleanupCutoffSeconds']
    if (type(cutoff) not in (int,float) or not previous<cutoff<=75
            or cutoff-row['phases'][3]['startSeconds']>15):
        raise ValueError('inspector-shared-cutoff')


def validate_observations(record):
    if (type(record) is not dict or set(record)!={'scope','tests','cases','nativeExecutionAllowed'}
            or record['scope']!='synthetic-inspector-interruption' or type(record['tests']) is not int
            or record['tests']!=5 or record['nativeExecutionAllowed'] is not False
            or type(record['cases']) is not list or len(record['cases'])!=2):
        raise ValueError('inspector-observation-scope')
    faults=set()
    changing={'keeperOwnership','fixtureDisposalVerified','observerLossVerified','standbyInspectionVerified','inspectorPersistence','interruptionVerified','slotOccupied','inspectorState','enrollmentAckObserved'}
    for case in record['cases']:
        names=('beforeObserverLoss','observed','afterExplicitFixtureDisposal')
        if type(case) is not dict or set(case)!=set(names):
            raise ValueError('inspector-case-schema')
        baseline=None
        for stage,name in enumerate(names):
            snapshot=case[name]
            validate_snapshot(snapshot,stage)
            immutable={key:value for key,value in snapshot.items() if key not in changing}
            if baseline is not None and immutable!=baseline:
                raise ValueError('inspector-recovery-promoted-verdict')
            baseline=immutable
        fault=case['observed']['evidenceFault']
        if fault in faults:
            raise ValueError('inspector-repeat-case')
        faults.add(fault)
    if faults!={'missing','receipt-blocked'}:
        raise ValueError('inspector-matrix')


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
    print('Saved inspector interruption evidence verified; native admission disabled')


def develop():
    if (composition.SOURCE / 'linux_runtime.py').read_bytes() != build.generated():
        raise ValueError('inspector-interruption-runtime-stale')
    import test_live
    from resources import BudgetCapture, MetadataFiles, writer
    with contextlib.ExitStack() as handles:
        capture = BudgetCapture(composition.LeaseBudget('collector'))
        handles.callback(capture.close)
        files = MetadataFiles(capture, capture.budget)
        handles.callback(files.close)
        bound = composition.sources()
        files.write('controller', 'attempt.json', writer.encode({'scope': 'custody-recovery-harness', 'sources': bound}))
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
            (composition.ROOT / '.git/tiye-inspector-interruption-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': locator}), encoding='utf-8')
            raise RuntimeError('inspector-interruption-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-inspector-interruption',
                    'tests': report.testsRun, 'cases': test_live.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
    destination = composition.ROOT / '.git/tiye-inspector-interruption' / uuid.uuid4().hex
    destination.mkdir(parents=True)
    for name, record in [('observations.json', selected), ('sources.json', bound),
                         ('private-locator.json', {'path': locator})]:
        (destination / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Two inspector interruption cases passed: ' + str(destination / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        develop()
    else:
        verify()
