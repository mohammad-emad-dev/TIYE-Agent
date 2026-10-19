"""Offline saved-result check; --develop runs the four real synthetic cases."""
import argparse
import contextlib
import io
import json
import math
import unittest
import uuid

from bindings import ROOT, composition, sources

OUT = ROOT / 'output/s6-scheduled-wsl'
ARTIFACTS = {'README.md', 'review.json', 'observations.json'}
REFERENCES = {'output/s6-charged-wsl/evidence.json', 'output/s6-deadline-recovery/evidence.json',
              'output/s6-native-contract/contract.json'}


def validate_observations(record):
    if (type(record) is not dict or set(record) != {'scope', 'liveTests', 'cases', 'nativeExecutionAllowed'}
            or record['scope'] != 'synthetic-scheduled-windows-ubuntu-adapters'
            or type(record['liveTests']) is not int or record['liveTests'] != 4
            or record['nativeExecutionAllowed'] is not False or type(record['cases']) is not list
            or len(record['cases']) != 4):
        raise ValueError('selected-scope-or-count')
    modes = set()
    for row in record['cases']:
        validate_case(row)
        if row['mode'] in modes:
            raise ValueError('duplicate-selected-mode')
        modes.add(row['mode'])


def validate_case(row):
    fields = {'mode', 'scope', 'outcome', 'cleanupVerified', 'unsettledOperations',
              'automaticRetryAllowed', 'nativeExecutionAllowed', 'phases', 'cleanupCutoffSeconds'}
    if type(row) is not dict or set(row) != fields:
        raise ValueError('case-schema-private-fields-forbidden')
    known = row['mode'] in ('owner-exit', 'stall')
    cancelled = row['mode'] == 'spawn-unacknowledged'
    if row['mode'] not in ('owner-exit', 'stall', 'guardian-loss', 'spawn-unacknowledged'):
        raise ValueError('mode')
    if (row['scope'] != 'synthetic-scheduled-windows-ubuntu-adapters'
            or row['outcome'] != ('cleanup-observed' if known else 'unknown')
            or row['cleanupVerified'] is not known or row['automaticRetryAllowed'] is not False
            or row['nativeExecutionAllowed'] is not False
            or type(row['unsettledOperations']) is not int or row['unsettledOperations'] != int(cancelled)):
        raise ValueError('case-verdict-or-admission-promotion')
    expected = ['host-start'] if cancelled else ['host-start', 'child-start', 'initialize', 'eof', 'observe']
    if (type(row['phases']) is not list or any(type(phase) is not dict for phase in row['phases'])
            or [phase.get('phase') for phase in row['phases']] != expected):
        raise ValueError('phase-sequence')
    previous = 0
    for phase in row['phases']:
        previous = validate_phase(phase, previous)
    cutoff = row['cleanupCutoffSeconds']
    if cancelled:
        if cutoff is not None:
            raise ValueError('cancelled-launch-has-no-cleanup-phase')
    elif (type(cutoff) not in (int, float) or not math.isfinite(cutoff)
          or not previous < cutoff <= 75 or cutoff - row['phases'][3]['startSeconds'] > 15):
        raise ValueError('shared-cleanup-cutoff')


def validate_phase(phase, previous):
    if set(phase) != {'phase', 'startSeconds', 'endSeconds', 'cutoffSeconds', 'completedWithinPhase'}:
        raise ValueError('phase-schema')
    for name in ('startSeconds', 'endSeconds', 'cutoffSeconds'):
        if type(phase[name]) not in (int, float) or not math.isfinite(phase[name]):
            raise ValueError('finite-phase-time')
    start, end, cutoff = (phase[name] for name in ('startSeconds', 'endSeconds', 'cutoffSeconds'))
    cap = {'host-start': 30, 'child-start': 15, 'initialize': 15, 'eof': 5, 'observe': 15}[phase['phase']]
    absolute = 60 if phase['phase'] in ('host-start', 'child-start', 'initialize') else (75 if phase['phase'] == 'eof' else 90)
    if (phase['completedWithinPhase'] is not True or not previous <= start <= end < cutoff <= absolute
            or cutoff - start > cap):
        raise ValueError('phase-deadline-or-order')
    return end


def validate_evidence(evidence):
    if (set(evidence) != {'sources', 'artifacts', 'references', 'nativeExecutionAllowed'}
            or evidence['sources'] != sources() or evidence['nativeExecutionAllowed'] is not False):
        raise ValueError('source-or-admission-drift')
    for key, names, base in [('artifacts', ARTIFACTS, OUT), ('references', REFERENCES, ROOT)]:
        if set(evidence[key]) != names:
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
        bound_sources = sources()
        files.write('controller', 'attempt.json', writer.encode({
            'scope': 'separate-development-harness', 'sources': bound_sources,
            'nativeExecutionAllowed': False}))
        log = io.StringIO()
        report = unittest.TextTestRunner(stream=log, verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromModule(test_live))
        if sources() != bound_sources:
            raise RuntimeError('source-changed-during-live-cohort')
        payload = log.getvalue().encode()
        for offset in range(0, len(payload), writer.CHUNK):
            files.write('observer', 'stdout.bin', payload[offset:offset + writer.CHUNK])
        files.write('controller', 'outcome.json', writer.encode({'successful': report.wasSuccessful(),
            'testsRun': report.testsRun, 'privateRuns': test_live.PRIVATE_RUNS}))
        files.audit()
        locator = str(capture.storage.path)
        if not report.wasSuccessful():
            (ROOT / '.git/tiye-scheduled-wsl-failure.json').write_text(
                json.dumps({'privateDiagnosticRoot': locator}), encoding='utf-8')
            raise RuntimeError('scheduled-fixtures-failed-protected-diagnostics-retained')
        selected = {'scope': 'synthetic-scheduled-windows-ubuntu-adapters', 'liveTests': report.testsRun,
                    'cases': test_live.OBSERVATIONS, 'nativeExecutionAllowed': False}
        validate_observations(selected)
    target = ROOT / '.git/tiye-scheduled-wsl' / uuid.uuid4().hex
    target.mkdir(parents=True)
    for name, record in [('observations.json', selected), ('sources.json', sources()),
                         ('private-locator.json', {'path': locator})]:
        (target / name).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Scheduled cross-OS tests passed; selected result: ' + str(target / 'observations.json'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--develop', action='store_true')
    args = parser.parse_args()
    if args.develop:
        develop()
    else:
        validate_evidence(json.loads((OUT / 'evidence.json').read_text()))
        validate_observations(json.loads((OUT / 'observations.json').read_text()))
        print('Saved synthetic adapter schedule verified; native execution disabled')
