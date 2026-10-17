"""Offline acceptance of mock protocol and independent cleanup observations."""
import base64
import json

CASES = {'valid-exit', 'valid-crash', 'foreign-exit'}


def validate_protocol(record):
    protocol = record['protocol']
    report = protocol['report']
    foreign = record['case'] == 'foreign-exit'
    if (protocol['childMembership']['cgroup'] != '0::' + record['descriptor']['controlGroup']
            or protocol['childMembership']['identity']['uid'] != 1000):
        raise ValueError('mock-child-outside-owned-cgroup')
    expected_fault = 'uncorrelated-or-error-response' if foreign else None
    if (protocol['mockOnly'] is not True or protocol['accepted'] is not (not foreign)
            or protocol['nonce'] != record['identities'][0]['nonce']
            or protocol['handshakeFault'] != expected_fault or report['fault'] != expected_fault):
        raise ValueError('mock-handshake-mismatch')
    if (report['directChildReaped'] is not True or report['returnCode'] != 0
            or report['spawnUncertain'] is not False or report['cleanupErrors'] or report['signals']
            or report['readerEof'] != {'stdout': True, 'stderr': True}):
        raise ValueError('mock-transport-cleanup-unverified')
    if len(report['writes']) != (1 if foreign else 2) or any(
            write['state'] != 'locally-drained' for write in report['writes']):
        raise ValueError('mock-write-sequence-mismatch')
    expected_stderr = b'' if foreign else b'initialized-notification-observed\n'
    for stream in ('stdout', 'stderr'):
        raw = base64.b64decode(protocol['rawBase64'][stream], validate=True)
        if (len(raw) != report['retainedBytes'][stream]
                or len(raw) != report['observedBytes'][stream]
                or report['discardedBytes'][stream] != 0):
            raise ValueError('mock-capture-accounting-mismatch')
        if stream == 'stderr' and raw != expected_stderr:
            raise ValueError('mock-notification-witness-mismatch')


def validate_cleanup(record):
    if not all(record[key] is True for key in (
            'independentPidfdsSignaled', 'originalProcEntriesAbsent', 'unrelatedSentinelLive')):
        raise ValueError('independent-witness-missing')
    descriptor = record['descriptor']
    expected = {'Id': descriptor['unit'], 'InvocationID': descriptor['invocationId'],
        'ControlGroup': descriptor['controlGroup'], 'MainPID': str(descriptor['mainPid']),
        'KillMode': 'control-group', 'ExitType': 'main', 'RuntimeMaxUSec': '8s',
        'TimeoutStopUSec': '500ms', 'UMask': '0077', 'Delegate': 'no', 'Restart': 'no',
        'SendSIGKILL': 'yes', 'Transient': 'yes'}
    if any(descriptor['properties'].get(key) != value for key, value in expected.items()):
        raise ValueError('service-properties-mismatch')
    main, leaf = record['identities']
    if (main['pid'] != descriptor['mainPid'] or leaf['ppid'] != main['pid']
            or main['sid'] == leaf['sid'] or main['cgroup'] != '0::' + descriptor['controlGroup']
            or leaf['cgroup'] != main['cgroup']
            or record['sentinelIdentity']['cgroup'] == main['cgroup']):
        raise ValueError('service-membership-mismatch')
    if (record['elapsedSeconds'] >= 5 or (record['cgroupAfter'] != 'removed'
            and 'populated 0' not in record['cgroupAfter'].splitlines())):
        raise ValueError('service-cleanup-incomplete')
    after = record['after']['properties']
    crashed = record['case'] == 'valid-crash'
    if (after.get('Result') != ('signal' if crashed else 'timeout')
            or after.get('ExecMainStatus') != ('9' if crashed else '0')):
        raise ValueError('main-exit-and-cleanup-status-mismatch')


def validate_observation(observation):
    if (observation['uid'] != 1000 or observation['testExitCode'] != 0
            or base64.b64decode(observation['stderrBase64'], validate=True)):
        raise ValueError('fixture-exit-or-uid')
    tests = json.loads(base64.b64decode(observation['stdoutBase64'], validate=True))
    records = tests['observations']
    if (tests['testCount'] != 3 or tests['passed'] is not True or len(records) != 3
            or {record['case'] for record in records} != CASES):
        raise ValueError('mock-cohort-incomplete')
    for record in records:
        validate_protocol(record)
        validate_cleanup(record)
    return tests
