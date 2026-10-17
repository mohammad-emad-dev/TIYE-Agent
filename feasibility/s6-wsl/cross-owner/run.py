"""Offline by default; explicit Windows/WSL fixed mock owner-crash capture."""
import argparse
import hashlib
import io
import json
import os
import platform
import sys
import time
import unittest
import uuid
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
OUT = ROOT / 'output/s6-cross-owner'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(SOURCE.glob('*.py'))}


def validate(records):
    if len(records) != 2 or {record['case'] for record in records} != {'root-crash', 'watchdog-crash'}:
        raise ValueError('cross-owner-cases-missing')
    for record in records:
        linux = record['linux']
        if not all(linux[key] is True for key in (
                'originalPidfdsSignaled', 'originalProcEntriesAbsent', 'unrelatedSentinelLive')):
            raise ValueError('cross-owner-linux-cleanup-unverified')
        if (record['windowsHeldHandlesSignaled'] is not True
                or linux['protocolCompletion'] != 'interrupted-unobserved'
                or not 0 <= linux['preActionSeconds'] < 2
                or not 0 <= linux['cleanupSeconds'] < 4 or not 0 <= linux['totalSeconds'] < 6):
            raise ValueError('cross-owner-timing-or-outcome')
        descriptor = linux['descriptor']
        nonce = linux['nonce']
        if record['linuxRuntime']['uid'] != 1000 or record['linuxRuntime']['nonce'] != nonce:
            raise ValueError('cross-owner-runtime-mismatch')
        if (record['windowsIdentities']['nonce'] != nonce
                or descriptor['unit'] != 'tiye-service-' + nonce + '.service'
                or linux['leaseAtArm']['nonce'] != nonce
                or any(identity['nonce'] != nonce for identity in linux['identities'])):
            raise ValueError('cross-owner-generation-mismatch')
        for role in ('root', 'bridge'):
            if record['windowsIdentities'][role]['nonce'] != nonce:
                raise ValueError('Windows identity nonce mismatch')
        if (linux['after']['properties']['InvocationID'] != descriptor['invocationId']
                or linux['after']['properties']['Id'] != descriptor['unit']
                or linux['after']['properties']['ExecMainStatus'] != '71'
                or linux['after']['properties']['ExecMainCode'] != '1'
                or linux['after']['properties']['Result'] != 'exit-code'):
            raise ValueError('cross-owner-lease-main-exit-unverified')
        main, leaf, peer = linux['identities']
        if (main['pid'] != descriptor['mainPid'] or peer['stage'] != 'pending'
                or peer['initializeReceived'] is not True or peer['initializedReceived'] is not False):
            raise ValueError('cross-owner-protocol-stage')
        unit_group = '0::' + descriptor['controlGroup']
        if any(identity['cgroup'] != unit_group for identity in (main, leaf, peer)):
            raise ValueError('cross-owner-membership')
        if any(identity['ppid'] != main['pid'] or identity['sid'] == main['sid'] for identity in (leaf, peer)):
            raise ValueError('cross-owner-parentage')
        props = descriptor['properties']
        expected = {'KillMode': 'control-group', 'ExitType': 'main', 'RuntimeMaxUSec': '8s',
            'TimeoutStopUSec': '500ms', 'Restart': 'no', 'Delegate': 'no', 'UMask': '0077',
            'SendSIGKILL': 'yes', 'Transient': 'yes'}
        if any(props.get(key) != value or linux['before']['properties'].get(key) != value
                for key, value in expected.items()):
            raise ValueError('cross-owner-service-policy-mismatch')
        before = linux['before']
        if (before['returnCode'] != 0 or before.get('timedOut', False)
                or before['properties']['ActiveState'] != 'active'
                or any(before['properties'][key] != props[key]
                    for key in ('Id', 'InvocationID', 'ControlGroup', 'MainPID'))):
            raise ValueError('cross-owner-active-invocation-missing')
        for outside in (linux['observer'], linux['sentinel']):
            if outside['cgroup'] == unit_group or outside['cgroup'].startswith(unit_group + '/'):
                raise ValueError('cross-owner-observer-inside-unit')
        if linux['cgroupAfter'] != 'removed' and 'populated 0' not in linux['cgroupAfter'].splitlines():
            raise ValueError('cross-owner-cgroup-not-empty')
        expiry, lease = linux['expiry'], linux['leaseAtArm']
        if (expiry['reason'] != 'expired' or expiry['nonce'] != linux['nonce']
                or expiry['pid'] != main['pid'] or not 1 <= expiry['ageSeconds'] < 4
                or expiry['lastSequence'] < lease['sequence']
                or expiry['lastReceived'] < lease['received']
                or expiry['observedMonotonic'] - expiry['lastReceived'] != expiry['ageSeconds']):
            raise ValueError('cross-owner-expiry-not-correlated')
        if record['case'] == 'watchdog-crash':
            if record['watchdogReport'] is not None:
                raise ValueError('crashed-watchdog-fabricated-report')
        else:
            report = record['watchdogReport']
            if (report['windowsJobEmpty'] is not True or report['rootHandleSignaled'] is not True
                    or report['stopReason'] != 'job-empty' or report['finalRootExitCode'] != 77):
                raise ValueError('windows-root-failure-not-preserved')


def capture(output):
    if os.name != 'nt':
        raise OSError('Windows required')
    frozen = sources()
    output.mkdir(parents=True, exist_ok=True)
    with (output / 'input.json').open('x', encoding='utf-8') as stream:
        json.dump({'sourceSha256': frozen, 'distribution': 'Ubuntu', 'uid': 1000,
            'cases': ['root-crash', 'watchdog-crash'], 'nativeAdmissionGranted': False}, stream, indent=2)
    import test_cross
    test_cross.DESTINATION = output
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(test_cross.CrossOwnerTests)
    log = io.StringIO()
    started = time.monotonic()
    tests = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    (output / 'tests.log').write_text(log.getvalue(), encoding='utf-8')
    (output / 'observations.json').write_text(json.dumps(test_cross.OBSERVATIONS, indent=2), encoding='utf-8')
    evidence = {'projectDate': '2026-10-17', 'windows': platform.platform(), 'python': platform.python_version(),
        'sourceSha256': frozen, 'sourcesUnchanged': frozen == sources(),
        'testCount': tests.testsRun, 'testsSuccessful': tests.wasSuccessful(),
        'elapsedSeconds': time.monotonic() - started, 'nativeProviderRuns': 0,
        'nativeAdmissionGranted': False, 'phase1': 'HOLD',
        'artifactSha256': {p.relative_to(output).as_posix(): sha(p) for p in output.rglob('*') if p.is_file()}}
    with (output / 'evidence.json').open('x', encoding='utf-8') as stream:
        json.dump(evidence, stream, indent=2)
    print(log.getvalue())
    if not tests.wasSuccessful() or not evidence['sourcesUnchanged']:
        return 1
    validate(test_cross.OBSERVATIONS)
    return 0


def check():
    for path in SOURCE.glob('*.py'):
        compile(path.read_text(encoding='utf-8'), path.name, 'exec')
    evidence = json.loads((OUT / 'evidence.json').read_text(encoding='utf-8'))
    if sources() != evidence['sourceSha256'] or evidence['sourcesUnchanged'] is not True:
        raise ValueError('cross-owner-sources-changed')
    for name, expected in evidence['artifactSha256'].items():
        if sha(OUT / name) != expected:
            raise ValueError('cross-owner-artifact-changed:' + name)
    if (evidence['testCount'] != 2 or evidence['testsSuccessful'] is not True
            or evidence['nativeProviderRuns'] != 0 or evidence['nativeAdmissionGranted'] is not False
            or evidence['phase1'] != 'HOLD'):
        raise ValueError('cross-owner-capture-incomplete')
    validate(json.loads((OUT / 'observations.json').read_text(encoding='utf-8')))
    print('Saved Windows/WSL ownership boundary: 2 mock cases; native admission disabled')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--develop', action='store_true')
    arguments = parser.parse_args()
    if arguments.capture and arguments.develop:
        parser.error('choose one destination')
    if arguments.capture:
        for name in ('README.md', 'review.json'):
            if not (OUT / name).is_file():
                raise ValueError('capture-prerequisite-missing:' + name)
    destination = ROOT / '.git/tiye-cross-owner-development' / uuid.uuid4().hex if arguments.develop else OUT
    raise SystemExit(capture(destination) if arguments.capture or arguments.develop else check())
