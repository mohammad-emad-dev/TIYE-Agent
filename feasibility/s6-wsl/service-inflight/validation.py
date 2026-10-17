"""Saved mock interruption evidence never establishes protocol completion."""
import base64
import json

CASES = {'pending-crash', 'initialized-crash', 'pending-stop', 'initialized-stop'}


def validate_stage(record):
    main, leaf, child = record['identities']
    observer = record['observerIdentity']
    unit_group = '0::' + record['descriptor']['controlGroup']
    if observer['pid'] in {identity['pid'] for identity in (main, leaf, child)} or observer['uid'] != 1000:
        raise ValueError('observer-not-independent')
    if any(outside['cgroup'] == unit_group or outside['cgroup'].startswith(unit_group + '/')
            for outside in (observer, record['sentinelIdentity'])):
        raise ValueError('witness-inside-owned-cgroup-subtree')
    stage, action = record['case'].rsplit('-', 1)
    registered = record['registeredChild']
    request = child['initializeRequest']
    expected_notification = {'method': 'initialized'} if stage == 'initialized' else None
    if (request.get('method') != 'initialize' or type(request.get('id')) is not int
            or request['id'] != 1 or child['initializedNotification'] != expected_notification):
        raise ValueError('peer-observed-wire-stage-mismatch')
    if (record['stage'] != stage or record['action'] != action
            or child['stage'] != stage or child['initializeReceived'] is not True
            or child['initializedReceived'] is not (stage == 'initialized')
            or child['uid'] != 1000 or child['ppid'] != main['pid']
            or child['sid'] == main['sid']):
        raise ValueError('inflight-stage-or-parentage-mismatch')
    if any(registered['identity'][key] != child[key] for key in ('pid', 'startTicks', 'uid')):
        raise ValueError('registered-child-mismatch')
    if (registered['cgroup'] != child['cgroup']
            or record['originalInstancesLiveBeforeAction'] is not True
            or record['protocolResultPresentBefore'] is not False
            or record['protocolResultPresentAfter'] is not False
            or record['protocolCompletion'] != 'interrupted-unobserved'):
        raise ValueError('interrupted-protocol-completion-misrepresented')
    if len({identity['pid'] for identity in record['identities']}) != 3:
        raise ValueError('duplicate-owned-instance')
    if any(identity['nonce'] != main['nonce'] for identity in (leaf, child)):
        raise ValueError('inflight-nonce-mismatch')


def validate_cleanup(record):
    if not all(record[key] is True for key in (
            'independentPidfdsSignaled', 'originalProcEntriesAbsent', 'unrelatedSentinelLive')):
        raise ValueError('inflight-independent-cleanup-missing')
    descriptor = record['descriptor']
    before = record['beforeActionQuery']
    if (before['returnCode'] != 0 or before.get('timedOut', False)
            or before['properties']['ActiveState'] != 'active'
            or any(before['properties'].get(key) != descriptor['properties'][key]
                for key in ('Id', 'InvocationID', 'ControlGroup', 'MainPID'))
            or not 0 <= record['preActionSeconds'] < 1
            or not record['preActionSeconds'] <= record['launchToCleanupSeconds'] < 3):
        raise ValueError('intervention-not-before-runtime-expiry')
    expected = {'Id': descriptor['unit'], 'InvocationID': descriptor['invocationId'],
        'ControlGroup': descriptor['controlGroup'], 'MainPID': str(descriptor['mainPid']),
        'KillMode': 'control-group', 'ExitType': 'main', 'RuntimeMaxUSec': '8s',
        'TimeoutStopUSec': '500ms', 'UMask': '0077', 'Delegate': 'no', 'Restart': 'no',
        'SendSIGKILL': 'yes', 'Transient': 'yes'}
    if any(descriptor['properties'].get(key) != value for key, value in expected.items()):
        raise ValueError('inflight-service-properties-mismatch')
    main, leaf, child = record['identities']
    if (main['pid'] != descriptor['mainPid'] or leaf['ppid'] != main['pid']
            or main['sid'] == leaf['sid'] or any(identity['cgroup'] !=
                '0::' + descriptor['controlGroup'] for identity in (main, leaf, child))
            or record['sentinelIdentity']['cgroup'] == main['cgroup']):
        raise ValueError('inflight-service-membership-mismatch')
    if (not 0 <= record['elapsedSeconds'] < 5 or (record['cgroupAfter'] != 'removed'
            and 'populated 0' not in record['cgroupAfter'].splitlines())):
        raise ValueError('inflight-cleanup-not-observed-in-bound')
    crashed = record['action'] == 'crash'
    if crashed:
        if record['stopReceipt'] is not None:
            raise ValueError('crash-test-used-explicit-stop')
        after = record['after']['properties']
    else:
        receipt = record['stopReceipt']
        initial = receipt['initialQuery']['properties']
        if any(initial.get(key) != descriptor['properties'][key]
                for key in ('Id', 'InvocationID', 'ControlGroup', 'MainPID')):
            raise ValueError('stop-receipt-identity-mismatch')
        if receipt['stop']['returnCode'] != 0 or receipt['stop']['timedOut']:
            raise ValueError('stop-request-incomplete')
        after = receipt['postStopQuery']['properties']
    if any(after.get(key) != descriptor['properties'][key] for key in ('Id', 'InvocationID')):
        raise ValueError('terminal-unit-invocation-mismatch')
    if after.get('Result') != ('signal' if crashed else 'timeout') or after.get('ExecMainStatus') != '9':
        raise ValueError('inflight-main-status-mismatch')


def validate_observation(observation):
    if (observation['uid'] != 1000 or observation['testExitCode'] != 0
            or base64.b64decode(observation['stderrBase64'], validate=True)):
        raise ValueError('inflight-fixture-exit-or-uid')
    tests = json.loads(base64.b64decode(observation['stdoutBase64'], validate=True))
    records = tests['observations']
    if (tests['testCount'] != 4 or tests['passed'] is not True or len(records) != 4
            or {record['case'] for record in records} != CASES):
        raise ValueError('inflight-cohort-incomplete')
    for record in records:
        validate_stage(record)
        validate_cleanup(record)
    return tests
